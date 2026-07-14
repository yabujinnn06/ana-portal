import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.db import SessionLocal, get_db
from app.errors import ApiError
from app.models import AdminUser, AssistantConfig, AuditActorType
from app.schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantConfigStatus,
    AssistantConfigUpdateRequest,
    AssistantUsage,
)
from app.security import require_admin, require_admin_permission, verify_admin_credentials, verify_password
from app.services.assistant import (
    EffectiveAssistantConfig,
    assistant_usage_payload,
    resolve_assistant_config,
    run_assistant,
    run_assistant_stream,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assistant"])


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "****"
    return f"...{key[-4:]}"


def _status_from(config: EffectiveAssistantConfig) -> AssistantConfigStatus:
    return AssistantConfigStatus(
        enabled=config.enabled,
        model=config.model,
        base_url=config.base_url,
        has_key=config.api_key is not None,
        key_source=config.key_source,
        key_masked=_mask_key(config.api_key),
        updated_by=config.updated_by,
        updated_at=config.updated_at,
    )


@router.post(
    "/api/admin/assistant/chat",
    response_model=AssistantChatResponse,
    dependencies=[Depends(require_admin_permission("reports"))],
)
def assistant_chat(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_admin_permission("reports")),
) -> AssistantChatResponse:
    result = run_assistant(
        db,
        [{"role": m.role, "content": m.content} for m in payload.messages],
    )
    actor = str(claims.get("username") or claims.get("sub") or "admin").strip() or "admin"
    # Denetim: kim, hangi araclari tetikledi (mesaj METNI saklanmaz - icinde isim/PII olabilir).
    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=actor,
        action="ASSISTANT_CHAT",
        success=True,
        entity_type="assistant",
        entity_id="chat",
        details={"tool_calls": result.get("tool_calls", []), "message_count": len(payload.messages)},
    )
    usage = result.get("usage")
    return AssistantChatResponse(
        reply=result["reply"],
        tool_calls=result["tool_calls"],
        usage=AssistantUsage(**usage) if usage else None,
    )


@router.post(
    "/api/admin/assistant/chat/stream",
    dependencies=[Depends(require_admin_permission("reports"))],
)
def assistant_chat_stream(
    payload: AssistantChatRequest,
    claims: dict[str, Any] = Depends(require_admin_permission("reports")),
) -> StreamingResponse:
    actor = str(claims.get("username") or claims.get("sub") or "admin").strip() or "admin"
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    message_count = len(payload.messages)

    def event_stream() -> Any:
        # StreamingResponse generator'i istek DI'sinden bagimsiz kendi session'ini tutar:
        # Depends(get_db) session'i akis bitmeden kapanabilir.
        db = SessionLocal()
        final_tools: list[str] = []
        had_error = False
        try:
            for event in run_assistant_stream(db, messages):
                etype = event.get("type")
                if etype == "done":
                    final_tools = event.get("tool_calls", []) or []
                elif etype == "error":
                    had_error = True
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except Exception:
            had_error = True
            logger.exception("assistant_stream_failed")
            err = {"type": "error", "message": "Asistana su an ulasilamadi. Lutfen birazdan tekrar deneyin."}
            yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
        finally:
            try:
                log_audit(
                    db,
                    actor_type=AuditActorType.ADMIN,
                    actor_id=actor,
                    action="ASSISTANT_CHAT",
                    success=not had_error,
                    entity_type="assistant",
                    entity_id="chat",
                    details={"tool_calls": final_tools, "stream": True, "message_count": message_count},
                )
            except Exception:
                logger.exception("assistant_stream_audit_failed")
                try:
                    db.rollback()
                except Exception:
                    pass
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/api/admin/assistant/usage",
    response_model=AssistantUsage,
)
def get_assistant_usage(
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
) -> AssistantUsage:
    config = resolve_assistant_config(db)
    return AssistantUsage(**assistant_usage_payload(db, config.model))


@router.get(
    "/api/admin/assistant/config",
    response_model=AssistantConfigStatus,
)
def get_assistant_config(
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
) -> AssistantConfigStatus:
    return _status_from(resolve_assistant_config(db))


@router.post(
    "/api/admin/assistant/config",
    response_model=AssistantConfigStatus,
)
def update_assistant_config(
    payload: AssistantConfigUpdateRequest,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_admin),
) -> AssistantConfigStatus:
    token_user = str(claims.get("username") or claims.get("sub") or "").strip()
    actor = token_user or "admin"

    # API anahtari degisimi hassas: kullanici adi + sifre ile yeniden dogrulama sart.
    # Model / base_url / aktiflik degisimi icin giris yapmis olmak yeterli.
    if payload.api_key is not None:
        provided = (payload.username or "").strip()
        password = payload.password or ""
        if not provided or not password:
            raise ApiError(
                status_code=422,
                code="REAUTH_REQUIRED",
                message="API anahtarini degistirmek icin kullanici adi ve sifre gerekli.",
            )
        if provided != token_user:
            raise ApiError(
                status_code=403,
                code="REAUTH_USER_MISMATCH",
                message="Yalnizca giris yapmis kullanici kendi kullanici adi ve sifresiyle anahtari degistirebilir.",
            )
        ok = verify_admin_credentials(provided, password)
        if not ok:
            admin_user = db.scalar(select(AdminUser).where(AdminUser.username == provided))
            ok = (
                admin_user is not None
                and admin_user.is_active
                and verify_password(password, admin_user.password_hash)
            )
        if not ok:
            raise ApiError(
                status_code=401,
                code="INVALID_CREDENTIALS",
                message="Kullanici adi veya sifre hatali.",
            )
        actor = provided

    row = db.get(AssistantConfig, 1)
    if row is None:
        row = AssistantConfig(id=1)
        db.add(row)

    changed: list[str] = []
    if payload.api_key is not None:
        row.api_key = payload.api_key.strip() or None
        changed.append("api_key")
    if payload.model is not None:
        row.model = payload.model.strip() or None
        changed.append("model")
    if payload.base_url is not None:
        row.base_url = payload.base_url.strip() or None
        changed.append("base_url")
    if payload.enabled is not None:
        row.enabled = payload.enabled
        changed.append("enabled")

    if not changed:
        # Bos istek: yaniltici "guncelleme" audit kaydi ve gereksiz yazma olmasin.
        db.rollback()
        return _status_from(resolve_assistant_config(db))

    row.updated_by = actor
    row.updated_at = datetime.now(timezone.utc)
    db.commit()

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=actor,
        action="ASSISTANT_CONFIG_UPDATE",
        success=True,
        entity_type="assistant_config",
        entity_id="1",
        details={"changed": changed},
    )

    return _status_from(resolve_assistant_config(db))
