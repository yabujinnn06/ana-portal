"""gpt-oss/Groq tool-call dayaniklilik katmani.

gpt-oss/harmony modelleri tool call'u bazen `<function=ad>{json}</function>`
seklinde duz metne gomup gonderir; Groq bunu reddedip 400 (tool_use_failed)
doner ama hatanin failed_generation alaninda ham ifade gelir. Burada o ifadeyi
ayiklayip tool'u biz calistiririz ve sentetik tool sonuclarini konusmaya ekleriz
ki model bir sonraki iterasyonda gercek veriyle cevabi tamamlasin.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.services.assistant_tools import _TOOL_DISPATCH, dispatch_tool_cached

logger = logging.getLogger(__name__)

_FUNC_CALL_RE = re.compile(r"<function=([a-zA-Z0-9_]+)\s*>(.*?)</function>", re.DOTALL)


def _is_transient_tool_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "tool_use_failed" in text
        or "tool call validation" in text
        or "failed_generation" in text
    )


def _safe_json_obj(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return {}
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}


def _extract_failed_tool_calls(exc: Exception) -> list[tuple[str, dict[str, Any]]]:
    raw: str | None = None
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and isinstance(err.get("failed_generation"), str):
            raw = err["failed_generation"]
    if raw is None:
        raw = str(exc)
    calls: list[tuple[str, dict[str, Any]]] = []
    for name, payload in _FUNC_CALL_RE.findall(raw):
        name = name.strip()
        if name in _TOOL_DISPATCH:
            calls.append((name, _safe_json_obj(payload)))
    return calls


def recover_from_failed_tool_call(
    db: Session,
    exc: Exception,
    messages: list[dict[str, Any]],
    used_tools: list[str],
    tool_cache: dict[str, str],
) -> bool:
    """400/tool_use_failed govdesindeki <function=...> ifadelerini ayiklar, tool'lari
    calistirir ve sentetik assistant tool_call + tool sonuclarini mesajlara ekler.
    Boylece model bir sonraki iterasyonda gercek veriyle cevabi tamamlar."""
    if not _is_transient_tool_error(exc):
        return False
    calls = _extract_failed_tool_calls(exc)
    if not calls:
        return False
    synth: list[dict[str, Any]] = []
    tool_msgs: list[dict[str, Any]] = []
    for name, args in calls:
        # Birden fazla recovery turunda da garanti benzersiz tool_call id.
        cid = f"recovered_{uuid.uuid4().hex[:12]}"
        synth.append(
            {
                "id": cid,
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
            }
        )
        used_tools.append(name)
        content = dispatch_tool_cached(db, name, args, tool_cache)
        tool_msgs.append({"role": "tool", "tool_call_id": cid, "content": content})
    messages.append({"role": "assistant", "content": "", "tool_calls": synth})
    messages.extend(tool_msgs)
    logger.warning("assistant_recovered_failed_tool_call", extra={"tools": [c[0] for c in calls]})
    return True
