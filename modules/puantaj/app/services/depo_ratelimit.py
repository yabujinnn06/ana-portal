"""Depo modulu icin login kilitleme + islem bazli hiz siniri.

Ported from the standalone depojin app (backend/app/ratelimit.py) as part of the depo
entegrasyonu (see CLAUDE.md). No behavior changes; uses depo_login_denemeleri /
DepoLoginDeneme instead of the original login_denemeleri / LoginDeneme.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import Depends, HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from app.services.depo_auth import current_depo_user
from app.models import DepoLoginDeneme, DepoUser
from app.services.depo_utils import utc_now


PENCERE_DK = 5
MAX_BASARISIZ = 5


def kontrol_login_kilit(db: Session, ad: str) -> tuple[bool, int]:
    """Returns (locked, kalan_saniye)."""
    sinir = utc_now() - timedelta(minutes=PENCERE_DK)
    basarisiz = db.scalar(
        select(func.count(DepoLoginDeneme.id)).where(
            and_(
                DepoLoginDeneme.ad == ad,
                DepoLoginDeneme.basarili == False,
                DepoLoginDeneme.zaman > sinir,
            )
        )
    ) or 0
    if basarisiz < MAX_BASARISIZ:
        return False, 0
    son = db.scalar(
        select(func.max(DepoLoginDeneme.zaman)).where(
            and_(DepoLoginDeneme.ad == ad, DepoLoginDeneme.basarili == False)
        )
    )
    if son is None:
        return False, 0
    kilit_bitis = son + timedelta(minutes=PENCERE_DK)
    kalan = int((kilit_bitis - utc_now()).total_seconds())
    return (kalan > 0), max(0, kalan)


def kaydet_deneme(db: Session, ad: str, ip: str | None, basarili: bool) -> None:
    db.add(DepoLoginDeneme(ad=ad, ip=ip, basarili=basarili))
    db.commit()


# Kullanici basina in-memory sliding-window limiter. Login-disi, yuksek frekansli
# endpoint'ler (tarama, import, toplu-giris) icin; DB tabanli LoginDeneme yaklasimi
# bu hacimde uygun degil. Not: sureç basina calisir, coklu worker'da limit worker
# sayisiyla carpilir (bu proje olceginde kabul edilebilir).
_hiz_limit_lock = threading.Lock()
_hiz_limit_gecmis: dict[tuple[int, str], deque[float]] = defaultdict(deque)


def hiz_limiti(islem: str, max_istek: int, pencere_sn: float):
    def _dep(user: DepoUser = Depends(current_depo_user)) -> None:
        anahtar = (user.id, islem)
        simdi = time.monotonic()
        with _hiz_limit_lock:
            gecmis = _hiz_limit_gecmis[anahtar]
            while gecmis and simdi - gecmis[0] > pencere_sn:
                gecmis.popleft()
            if len(gecmis) >= max_istek:
                kalan = int(pencere_sn - (simdi - gecmis[0])) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Cok fazla istek, {kalan} saniye sonra tekrar deneyin",
                )
            gecmis.append(simdi)
    return _dep
