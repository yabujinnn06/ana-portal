#!/usr/bin/env python
from __future__ import annotations

import json
import os
import re
import sys
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.schema_guard import verify_runtime_schema
from app.settings import get_settings

VERSIONS_DIR = ROOT_DIR / "app" / "migrations" / "versions"
ADMIN_INDEX = ROOT_DIR / "app" / "static" / "admin" / "index.html"
EMPLOYEE_INDEX = ROOT_DIR / "app" / "static" / "employee" / "index.html"
ADMIN_STATIC_ROOT = ROOT_DIR / "app" / "static" / "admin"
EMPLOYEE_STATIC_ROOT = ROOT_DIR / "app" / "static" / "employee"
TEXT_BUNDLE_SUFFIXES = {".html", ".js", ".css", ".json", ".webmanifest", ".svg"}
STATIC_REF_PATTERN = re.compile(
    r'(?P<ref>'
    r'/[A-Za-z0-9_./-]+\.(?:js|css|html|svg|png|ico|json|webmanifest|woff2?|ttf|eot)'
    r'(?:\?[^"\'`\s)]*)?'
    r'|(?:\./|\.\./|assets/)[A-Za-z0-9_./-]+\.(?:js|css|html|svg|png|ico|json|webmanifest|woff2?|ttf|eot)'
    r'(?:\?[^"\'`\s)]*)?'
    r')'
)


@dataclass(slots=True)
class CheckResult:
    name: str
    status: str
    details: dict[str, Any]

    @property
    def ok(self) -> bool:
        return self.status == "ok"


def _extract_revision_ids() -> list[str]:
    revisions: list[str] = []
    pattern = re.compile(r'^\s*revision\s*:\s*str\s*=\s*"([^"]+)"\s*$', re.MULTILINE)
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        if path.name.startswith("__"):
            continue
        content = path.read_text(encoding="utf-8")
        match = pattern.search(content)
        if match:
            revisions.append(match.group(1).strip())
    return revisions


def _asset_paths_from_index(index_path: Path) -> list[str]:
    content = index_path.read_text(encoding="utf-8")
    refs = re.findall(r'(?:src|href)="([^"]+)"', content)
    return [ref.strip() for ref in refs if ref.strip()]


def _extract_bundle_asset_refs(file_path: Path) -> list[str]:
    if file_path.suffix.lower() not in TEXT_BUNDLE_SUFFIXES:
        return []

    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []

    refs = {match.group("ref").strip() for match in STATIC_REF_PATTERN.finditer(content)}
    return sorted(ref for ref in refs if ref)


def _resolve_static_reference(
    ref: str,
    *,
    prefix: str,
    static_root: Path,
    source_path: Path | None = None,
) -> Path | None:
    relative_ref = ref.split("?", 1)[0].split("#", 1)[0]

    if not ref.startswith(prefix):
        if ref.startswith("/"):
            return None
        if relative_ref.startswith("assets/"):
            return static_root / relative_ref
        if source_path is None:
            return None
        resolved = (source_path.parent / relative_ref).resolve(strict=False)
        try:
            resolved.relative_to(static_root.resolve(strict=False))
        except ValueError:
            return None
        return resolved

    relative = relative_ref[len(prefix) :].lstrip("/")
    if not relative:
        return None
    return static_root / relative


def _check_spa_bundle(
    *,
    index_path: Path,
    static_root: Path,
    prefix: str,
    required_files: list[Path],
) -> dict[str, Any]:
    missing: list[dict[str, str]] = []
    visited: set[Path] = set()
    queue: deque[tuple[Path, str]] = deque()

    queue.append((index_path, "index"))
    for required_file in required_files:
        queue.append((required_file, "required"))

    while queue:
        current_path, discovered_from = queue.popleft()
        if current_path in visited:
            continue
        visited.add(current_path)

        if not current_path.exists():
            missing.append(
                {
                    "source": discovered_from,
                    "ref": str(current_path.relative_to(ROOT_DIR)),
                }
            )
            continue

        if current_path == index_path:
            refs = _asset_paths_from_index(index_path)
        else:
            refs = _extract_bundle_asset_refs(current_path)

        for ref in refs:
            resolved = _resolve_static_reference(
                ref,
                prefix=prefix,
                static_root=static_root,
                source_path=current_path,
            )
            if resolved is None:
                continue
            if not resolved.exists():
                missing.append(
                    {
                        "source": str(current_path.relative_to(ROOT_DIR)),
                        "ref": ref,
                        "resolved": str(resolved.relative_to(ROOT_DIR)),
                    }
                )
                continue
            if resolved not in visited:
                queue.append((resolved, str(current_path.relative_to(ROOT_DIR))))

    return {
        "index": str(index_path.relative_to(ROOT_DIR)),
        "checked_files": sorted(str(path.relative_to(ROOT_DIR)) for path in visited if path.exists()),
        "missing": missing,
    }


def _check_static_bundle() -> CheckResult:
    admin_bundle = _check_spa_bundle(
        index_path=ADMIN_INDEX,
        static_root=ADMIN_STATIC_ROOT,
        prefix="/admin-panel",
        required_files=[ADMIN_STATIC_ROOT / "admin-sw.js"],
    )
    employee_bundle = _check_spa_bundle(
        index_path=EMPLOYEE_INDEX,
        static_root=EMPLOYEE_STATIC_ROOT,
        prefix="/employee",
        required_files=[
            EMPLOYEE_STATIC_ROOT / "sw.js",
            EMPLOYEE_STATIC_ROOT / "manifest.webmanifest",
        ],
    )
    missing = admin_bundle["missing"] + employee_bundle["missing"]

    return CheckResult(
        name="static_bundle_integrity",
        status="ok" if not missing else "fail",
        details={
            "admin": admin_bundle,
            "employee": employee_bundle,
            "missing": missing,
        },
    )


def _check_push_config() -> CheckResult:
    settings = get_settings()
    public_key_set = bool((settings.push_vapid_public_key or "").strip())
    private_key_set = bool((settings.push_vapid_private_key or "").strip())
    pair_ok = public_key_set == private_key_set
    return CheckResult(
        name="push_config_pair",
        status="ok" if pair_ok else "fail",
        details={
            "push_vapid_public_key_set": public_key_set,
            "push_vapid_private_key_set": private_key_set,
            "pair_ok": pair_ok,
        },
    )


def _check_revision_id_lengths() -> CheckResult:
    revisions = _extract_revision_ids()
    max_len = 128
    too_long = [revision for revision in revisions if len(revision) > max_len]
    return CheckResult(
        name="migration_revision_length",
        status="ok" if not too_long else "fail",
        details={
            "max_len": max_len,
            "too_long": too_long,
            "total": len(revisions),
        },
    )


def _expected_alembic_heads() -> list[str]:
    config = Config(str(ROOT_DIR / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    return sorted(script.get_heads())


def _check_database_migration_and_schema() -> CheckResult:
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        return CheckResult(
            name="database_schema_guard",
            status="warn",
            details={"reason": "DATABASE_URL_NOT_SET"},
        )

    expected_heads = _expected_alembic_heads()
    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            current_versions = [
                str(row[0]).strip()
                for row in connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()
                if row and row[0] is not None
            ]
        schema_result = verify_runtime_schema(engine)
    finally:
        engine.dispose()

    missing_heads = [head for head in expected_heads if head not in current_versions]
    status = "ok"
    if missing_heads or (not schema_result.ok):
        status = "fail"

    return CheckResult(
        name="database_schema_guard",
        status=status,
        details={
            "expected_heads": expected_heads,
            "current_versions": current_versions,
            "missing_heads": missing_heads,
            "schema_guard_ok": schema_result.ok,
            "schema_guard_issues": schema_result.issues,
            "schema_guard_warnings": schema_result.warnings,
        },
    )


def main() -> int:
    checks = [
        _check_revision_id_lengths(),
        _check_push_config(),
        _check_static_bundle(),
        _check_database_migration_and_schema(),
    ]
    failed_checks = [check for check in checks if check.status == "fail"]
    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "ok": len(failed_checks) == 0,
        "checks": [
            {
                "name": check.name,
                "status": check.status,
                "details": check.details,
            }
            for check in checks
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if len(failed_checks) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
