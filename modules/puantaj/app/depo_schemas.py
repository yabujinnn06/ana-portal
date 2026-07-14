"""Depo/sayim modulu request/response semalari.

Ported from the standalone depojin app (backend/app/schemas.py) as part of the depo
entegrasyonu (see CLAUDE.md). Kept as a single module (mirrors depojin's own layout) rather
than folded into app/schemas.py, since the depo domain is a self-contained bounded context.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


def _as_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# Naive UTC datetime'lari +00:00 ekleyerek serilestirir; frontend yerel saate (TR UTC+3) cevirebilsin.
UtcDt = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str, when_used="json")]


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user_id: int
    ad: str
    rol: str


class RefreshIn(BaseModel):
    refresh_token: str


class LoginIn(BaseModel):
    ad: str
    pin: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ad: str
    rol: str
    aktif: bool


class UserCreate(BaseModel):
    ad: str
    pin: str
    rol: str = "sayan"


class UserUpdate(BaseModel):
    ad: str | None = None
    rol: str | None = None
    aktif: bool | None = None


class PinDegistirIn(BaseModel):
    eski_pin: str
    yeni_pin: str


class OturumOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ad: str
    lokasyon: str | None
    durum: str
    mod: str
    baslangic: UtcDt
    bitis: UtcDt | None
    depo_id: int | None = None
    depo_ad: str | None = None


class OturumCreate(BaseModel):
    ad: str
    lokasyon: str | None = None
    mod: str = "seri"
    depo_id: int | None = None


class StokOzet(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stok_kodu: str
    urun_adi: str
    toplam: int
    sayilan: int
    portal_sayim: int
    sonradan_eklendi: bool = False
    depo_miktar: int | None = None


class DepoCreate(BaseModel):
    ad: str
    lokasyon: str | None = None


class DepoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ad: str
    lokasyon: str | None
    aktif: bool
    olusturma: UtcDt


class DepoStokOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stok_kodu: str
    urun_adi: str
    miktar: int
    guncelleme: UtcDt


class DepoDetayOut(DepoOut):
    stoklar: list[DepoStokOut]


class TaramaIn(BaseModel):
    oturum_id: int
    seri: str
    secilen_seri_id: int | None = None
    secilen_stok_id: int | None = None
    client_scan_id: str | None = Field(default=None, min_length=1, max_length=80)


class CakisanSecenek(BaseModel):
    seri_id: int
    stok_id: int
    stok_kodu: str
    urun_adi: str
    sayildi: bool
    eslesme_tipi: str
    barkod_stokuyla_uyumlu_mu: bool | None = None


class TaramaOut(BaseModel):
    durum: str
    mesaj: str
    seri: str
    stok_kodu: str | None = None
    urun_adi: str | None = None
    toplam: int | None = None
    sayilan: int | None = None
    kalan: int | None = None
    portal_sayim: int | None = None
    portal_fark: int | None = None
    cakisan_stoklar: list[str] | None = None
    cakisan_secenekler: list[CakisanSecenek] | None = None
    raw_seri: str | None = None
    raw_input: str | None = None
    normalized_input: str | None = None
    resolved_serial: str | None = None
    parsed_stock_code: str | None = None
    client_scan_id: str | None = None
    idempotent_replay: bool = False


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zaman: UtcDt
    seri_giris: str
    durum: str
    stok_kodu: str | None
    urun_adi: str | None
    aciklama: str | None
    kullanici_ad: str | None = None


class OzetOut(BaseModel):
    toplam_seri: int
    sayilan_seri: int
    kalan_seri: int
    stok_sayisi: int
    portal_toplam: int
    portal_fark: int
    son_islem: UtcDt | None


class LogSayfaOut(BaseModel):
    toplam: int
    items: list[LogOut]


class DurumSayim(BaseModel):
    durum: str
    sayi: int


class KullaniciIstatistik(BaseModel):
    kullanici_id: int | None
    ad: str
    basarili: int
    mukerrer: int
    bulunamadi: int
    cakisma: int
    toplam_tarama: int
    son_tarama: UtcDt | None


class DakikaSayim(BaseModel):
    zaman: UtcDt
    basarili: int
    diger: int


class IstatistikOut(BaseModel):
    durum_dagilimi: list[DurumSayim]
    kullanici_basina: list[KullaniciIstatistik]
    dakika_serisi: list[DakikaSayim]
    ilk_tarama: UtcDt | None
    son_tarama: UtcDt | None
    tarama_dakika_dk: float


class EksikSeri(BaseModel):
    seri_id: int
    seri_no: str
    stok_kodu: str
    urun_adi: str


class EksikGrupOut(BaseModel):
    stok_id: int
    stok_kodu: str
    urun_adi: str
    toplam: int
    sayilan: int
    eksik: int
    portal_sayim: int
    seriler: list[str]
