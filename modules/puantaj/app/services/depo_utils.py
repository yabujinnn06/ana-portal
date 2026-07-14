"""Depo/sayim barkod ve metin yardimcilari.

Ported verbatim from the standalone depojin app (backend/app/utils.py) as part of the
depo entegrasyonu (see CLAUDE.md). No behavior changes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.settings import get_settings

_VARSAYILAN_TZ = "Europe/Istanbul"
_RX_INVISIBLE = re.compile(r"[\r\n\t ]")
_RX_EXTRA_INVISIBLE = re.compile(r"[​‌‍﻿]")
_RX_STOCK_SERIAL = re.compile(r"^\s*([0-9]{2,20})\s*([xX×/\-*])\s*(.+?)\s*$")

JUNK_STOK_LABELS = {"STOKKOD", "STOKKODU", "KOD", "KODU", "STOK", "SKU", "URUNKOD", "URUNKODU"}
SYSTEM_SHEET_NAMES = {"SAYIMPANELI", "STOKVERI", "TARAMALOG", "AYARLAR"}


def utc_now() -> datetime:
    """DB'de naive UTC datetime olarak saklanan kolonlarla tutarli, naive UTC dondurur."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def depo_tz() -> ZoneInfo:
    raw_name = (get_settings().attendance_timezone or "").strip() or _VARSAYILAN_TZ
    try:
        return ZoneInfo(raw_name)
    except Exception:
        return ZoneInfo(_VARSAYILAN_TZ)


def local_day_bounds_utc_naive(gun: date, tz: ZoneInfo | None = None) -> tuple[datetime, datetime]:
    """Verilen yerel (Europe/Istanbul varsayilan) takvim gununun UTC sinirlarini NAIVE dondurur.

    Depo modulunde tum zaman damgalari utc_now() ile naive UTC saklandigi icin (attendance
    tarafinin aksine, orada aware UTC donuyor) sinirlari da naive UTC'ye cevirip donduruyoruz --
    boylece DepoSeri.zimmet_zaman / DepoZimmetHareketi.zaman ile ayni turde karsilastirilir.
    """
    tz = tz or depo_tz()
    start_local = datetime.combine(gun, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def normalize_seri(raw) -> str:
    if raw is None:
        return ""
    s = _RX_INVISIBLE.sub("", str(raw))
    s = _RX_EXTRA_INVISIBLE.sub("", s)
    s = s.strip().upper()
    while " X" in s:
        s = s.replace(" X", "X")
    while "X " in s:
        s = s.replace("X ", "X")
    return s


@dataclass(frozen=True)
class BarkodParse:
    type: str
    raw: str
    normalized: str
    stock_code: str | None
    serial: str
    keys: list[str]


def parse_barkod(raw) -> BarkodParse:
    raw_text = "" if raw is None else str(raw)
    normalized = normalize_seri(raw_text)
    if not normalized:
        return BarkodParse("empty", raw_text, "", None, "", [])

    cleaned = _RX_EXTRA_INVISIBLE.sub("", _RX_INVISIBLE.sub("", raw_text)).strip()
    match = _RX_STOCK_SERIAL.match(cleaned)
    if not match:
        return BarkodParse("serial_only", raw_text, normalized, None, normalized, [normalized])

    stock_code = normalize_stok_kodu(match.group(1))
    separator = match.group(2).upper() if match.group(2) in {"x", "X"} else match.group(2)
    serial = normalize_seri(match.group(3))
    if not serial:
        return BarkodParse("serial_only", raw_text, normalized, None, normalized, [normalized])

    combined = f"{stock_code}{separator}{serial}"
    keys = [combined]
    if serial != combined:
        keys.append(serial)
    return BarkodParse("stock_serial", raw_text, combined, stock_code, serial, keys)


def normalize_stok_kodu(raw) -> str:
    if raw is None:
        return ""
    if isinstance(raw, float):
        return str(int(raw)) if raw.is_integer() else str(raw)
    if isinstance(raw, int):
        return str(raw)
    return _RX_INVISIBLE.sub("", str(raw)).strip().upper()


def temizle_metin(raw) -> str:
    if raw is None:
        return ""
    if isinstance(raw, float):
        return str(int(raw)) if raw.is_integer() else str(raw)
    return _RX_INVISIBLE.sub("", str(raw)).strip()


def temizle_portal_sayi(raw) -> int:
    if raw is None:
        return 0
    if isinstance(raw, bool):
        return 0
    if isinstance(raw, (int, float)):
        try:
            return int(raw)
        except (TypeError, ValueError, OverflowError):
            return 0
    s = _RX_INVISIBLE.sub("", str(raw)).strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def is_junk_stok_header(stok_kodu_raw) -> bool:
    if stok_kodu_raw is None:
        return False
    s = str(stok_kodu_raw).strip().upper().replace(" ", "")
    return s in JUNK_STOK_LABELS


def is_system_sheet(name: str) -> bool:
    return name.strip().upper() in SYSTEM_SHEET_NAMES


def candidate_seri_keys(scan_input) -> list[str]:
    return parse_barkod(scan_input).keys
