"""Puantaj Beyni - admin AI asistani (servis katmani).

Groq (OpenAI uyumlu) bir LLM'i, mevcut rapor servislerini "arac" olarak
kullanarak calistirir. LLM hangi araci ne zaman cagiracagina kendi karar verir;
veri her zaman bu servislerden gelir, model uydurmaz.

Arac semasi/handler'lari `assistant_tools`, gpt-oss tool-call kurtarma mantigi
`assistant_recovery` modulundedir. Bu modul yapilandirma, token kullanimi,
sistem promptu ve sohbet dongusunu (run_assistant) yonetir.
"""

from __future__ import annotations

import json
import logging
import math
import re
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import AssistantConfig, AssistantDailyUsage
from app.services.assistant_recovery import (
    _is_transient_tool_error,
    recover_from_failed_tool_call,
)
from app.services.assistant_tools import TOOLS, _now_local, dispatch_tool_cached
from app.settings import get_settings

logger = logging.getLogger(__name__)

_RETRY_AFTER_PATTERN = re.compile(r"try again in ([0-9a-z.\s]+)")
_RETRY_AFTER_TOKEN_PATTERN = re.compile(r"(\d+(?:\.\d+)?)(ms|s|m|h)")
_BURST_RATE_LIMIT_AUTO_RETRY_MAX_SECONDS = 4.0
_BURST_RATE_LIMIT_AUTO_RETRY_MIN_SECONDS = 0.2
_TR_FOLD = str.maketrans(
    {
        "ı": "i", "İ": "i", "I": "i",
        "ş": "s", "Ş": "s",
        "ğ": "g", "Ğ": "g",
        "ç": "c", "Ç": "c",
        "ö": "o", "Ö": "o",
        "ü": "u", "Ü": "u",
    }
)
_EMPLOYEE_ID_RE = re.compile(r"(?:\bid\s*(\d+)\b|\b(\d+)\s*id\b|^\s*(\d+)\s*$)", re.IGNORECASE)
_DIRECT_DAILY_HINTS = (
    "gunluk puantaj",
    "puantaj verisi",
    "puantajini goster",
    "puantaj verisi sun",
)
_DIRECT_MONTHLY_HINTS = (
    "fazla mesai",
    "mesaisi ne kadar",
    "aylik ozet",
    "aylik fazla mesai",
)
_DIRECT_DEPARTMENT_HINTS = (
    "departman",
    "departmanın",
    "hangi departman",
)
_SENSITIVE_LOCATION_REPLY = "Konum bilgisi paylasilmaz."
_SENSITIVE_PERSONNEL_REPLY = "Ozluk bilgileri paylasilmaz."
_DATE_RE = re.compile(r"\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b")
_TR_DATE_RE = re.compile(r"\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b")
_DAY_MONTH_RE = re.compile(r"\b(0?[1-9]|[12]\d|3[01])\s+([a-z]+)\b")
_MONTH_NAME_TO_NUM = {
    "ocak": 1,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "agustos": 8,
    "eylul": 9,
    "ekim": 10,
    "kasim": 11,
    "aralik": 12,
}
_SENSITIVE_LOCATION_TERMS = (
    "konum", "gps", "lokasyon", "nerede", "nerde", "harita", "koordinat", "enlem", "boylam",
)
_SENSITIVE_PERSONNEL_TERMS = (
    "tc", "tckn", "kimlik no", "sgk", "dogum", "dogum tarihi", "cinsiyet", "medeni hal",
    "maas", "ucret", "iban", "banka", "acil kisi", "acil durum", "sozlesme tipi",
    "ise giris", "pozisyon",
)
_SENSITIVE_PERSONNEL_PREFIXES = (
    "tckn", "sgk", "dogum", "cinsiyet", "maas", "ucret", "iban", "banka", "pozisyon",
)
_SMALL_TALK_REPLY = (
    "Iyiyim, tesekkur ederim. Puantaj, fazla mesai, izin, departman ya da yoklama "
    "icin net sorunu yazabilirsin."
)
_SMALL_TALK_PATTERNS = (
    "merhaba", "selam", "slm", "gunaydin", "iyi aksamlar", "iyi gunler",
    "nasilsin", "naber", "nbr", "tesekkur", "tesekkurler", "sagol", "saol",
)
_IDENTITY_REPLY = (
    "Ben Puantaj Zeka, bu sirketin puantaj (yoklama + fazla mesai) asistaniyim. "
    "Sunlarda yardimci olurum: gunluk/aylik puantaj ve fazla mesai, eksik gunler, "
    "izinler, vardiyalar, mesai kurallari, departman ozetleri, bugun kim geldi/gelmedi "
    "ve sirket geneli ozet. Ozluk (TC, maas, banka...) ve konum bilgisi paylasilmaz. "
    "Ornek: 'Ercument Caliskan haziran gunluk puantaji' ya da 'bugun kim gelmedi'."
)
_IDENTITY_PATTERNS = (
    "sen kimsin", "kimsin sen", "sen kimsib", "sen kim", "kimsin", "sen nesin",
    "sen nesin", "adin ne", "senin adin", "ismin ne", "ne yapabilirsin",
    "neler yapabilirsin", "ne ise yararsin", "ne ise yararsiniz", "gorevin ne",
    "ne yaparsin", "ne is yaparsin",
)
# Sirket geneli KISI-bazli fazla mesai siralamasi/listesi icin sinyaller. Artik
# bunu karsilayan bir arac var (sirket_kisi_fazla_mesai).
_SUPERLATIVE_TERMS = ("en cok", "en fazla", "en yuksek", "en az", "en dusuk")
_PERSON_LIST_TERMS = (
    "teker teker", "tek tek", "kisi bazli", "kisi kisi", "her birinin", "hepsinin",
    "herkesin", "bazinda", "tum calisan", "butun calisan", "her calisan",
)
_BROAD_SCOPE_TERMS = (
    "tum", "butun", "hepsi", "her departman", "tum departman", "butun departman",
    "genelinde", "sirket geneli",
)
_OVERTIME_TERMS = ("fazla mesai", "fazla calisma", "mesaisi", "fazla mesailerini")

_HISTORY_MESSAGE_CHAR_LIMITS = {"user": 400, "assistant": 900}
_HISTORY_TOTAL_CHAR_LIMIT = 2200

# Groq ucretsiz katman gunluk token limitleri (TPD). Kaynak: Groq rate-limits
# dokumantasyonu, Haziran 2026. Groq limitleri zamanla degisebilir.
GROQ_DAILY_TOKEN_CAP: dict[str, int] = {
    "llama-3.1-8b-instant": 500000,
    "llama-3.3-70b-versatile": 100000,
    "openai/gpt-oss-20b": 200000,
    "openai/gpt-oss-120b": 200000,
    "meta-llama/llama-4-scout-17b-16e-instruct": 500000,
    "qwen/qwen3-32b": 500000,
}


def _today_str() -> str:
    return _now_local().strftime("%Y-%m-%d")


def assistant_usage_payload(db: Session, model: str) -> dict[str, Any]:
    row = db.get(AssistantDailyUsage, (_today_str(), model))
    used = row.total_tokens if row else 0
    cap = GROQ_DAILY_TOKEN_CAP.get(model)
    return {
        "model": model,
        "used_today": used,
        "daily_cap": cap,
        "remaining": (max(cap - used, 0) if cap is not None else None),
    }


def _record_usage(db: Session, model: str, tokens: int) -> dict[str, Any]:
    # Kalici tut: servis yeniden baslasa (Render uyku/restart) da kalan limit dogru kalsin.
    if tokens > 0:
        day = _today_str()
        row = db.get(AssistantDailyUsage, (day, model))
        if row is None:
            row = AssistantDailyUsage(usage_date=day, model=model, total_tokens=0)
            db.add(row)
        row.total_tokens += tokens
        row.updated_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception:
            # Kullanim kaydi yazilamasa bile cevabi dondur; istegi 500'e cevirme.
            db.rollback()
            logger.exception("assistant_usage_commit_failed", extra={"model": model})
    return assistant_usage_payload(db, model)


@dataclass(frozen=True)
class EffectiveAssistantConfig:
    enabled: bool
    api_key: str | None
    base_url: str
    model: str
    key_source: str  # "db" | "env" | "none"
    updated_by: str | None
    updated_at: datetime | None


def get_assistant_config_row(db: Session) -> AssistantConfig | None:
    return db.get(AssistantConfig, 1)


def resolve_assistant_config(db: Session) -> EffectiveAssistantConfig:
    settings = get_settings()
    row = get_assistant_config_row(db)

    db_key = (row.api_key or "").strip() if row else ""
    env_key = (settings.assistant_api_key or "").strip()
    if db_key:
        api_key, key_source = db_key, "db"
    elif env_key:
        api_key, key_source = env_key, "env"
    else:
        api_key, key_source = None, "none"

    base_url = (row.base_url if row and row.base_url else None) or settings.assistant_base_url
    model = (row.model if row and row.model else None) or settings.assistant_model
    enabled = row.enabled if row and row.enabled is not None else settings.assistant_enabled

    return EffectiveAssistantConfig(
        enabled=enabled,
        api_key=api_key,
        base_url=base_url,
        model=model,
        key_source=key_source,
        updated_by=row.updated_by if row else None,
        updated_at=row.updated_at if row else None,
    )


def _system_prompt() -> str:
    now = _now_local()
    aylar = [
        "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
        "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik",
    ]
    bugun = f"{now.day} {aylar[now.month - 1]} {now.year} ({now:%Y-%m-%d})"
    return f"""Sen "Puantaj Zeka"sin: bir IK puantaj (yoklama + fazla mesai) sisteminin Turkce yapay zeka asistanisin.

BUGUN: {bugun}. "Bu ay" = {now.year}-{now.month:02d}. "Gecen ay" bir onceki takvim ayidir.

TEMEL KURALLAR:
- VERI sorularinda uygun araci cagir; sayilari ASLA uydurma, sadece arac ciktisini kullan. Emin olmadigin oran/carpani soyleme.
- "rapor/ozet/tekrar/guncelle/yeniden" gibi isteklerde onceki cevabi AYNEN kopyalama; ilgili araci YENIDEN cagirip guncel veriyle yanitla.
- Calisan adlarini ezbere bilmezsin: bir isim gecince once calisan_ara cagir (parca yeter, Turkce karakter/buyuk-kucuk fark etmez). Tek sonuc -> id ile devam; coklu -> isim+departman listesiyle "hangisi?" sor; bos (count=0) -> kisiyi UYDURMA, dogru yazim ya da ID iste. Kullanici dogrudan ID verirse (orn. "id 42") aramayi atla.
- Departman id'sini ezbere bilmezsin: department_id'ye gercek sayi ya da departman ADINI/parcasini yaz (orn. "teknik servis"); sistem Turkce-duyarli eslestirir, aciklama metni uydurma. Eslesme yoksa/coklu ise once departman_listesi cagir.

HANGI ARAC NE ZAMAN:
- Aylik mesai/FM TOPLAMI: kisi_aylik_ozet. Gun gun dokum: gunluk_puantaj. Giris/cikis eksik gunler: eksik_gunler.
- Kisi operasyonel bilgi (departman/bolge/vardiya/izin/cihaz/kural): kisi_detay.
- Departman mesai toplami: departman_aylik_ozet. Departman listesi+sayilar: departman_listesi. Bir departmanin calisanlari: departman_calisanlari.
- Vardiyalar: vardiya_listesi. Mesai kurallari: mesai_kurallari. Resmi tatiller: resmi_tatiller.
- "Bugun kim icerde/disarida/gelmedi": bugun_durumu. Sirket ozeti: sirket_ozeti. Izinler: izin_listesi.

YASAKLAR (asla verme, tahminle bile):
- OZLUK (TC, SGK, dogum, cinsiyet, medeni hal, maas/ucret, banka/IBAN, acil kisi, sozlesme tipi, ise giris, pozisyon): sorulursa sadece "Ozluk bilgileri paylasilmaz." Araclar zaten dondurmez.
- KONUM/GPS/nerede oldugu: sorulursa sadece "Konum bilgisi paylasilmaz."
- Bunlar disinda tum operasyonel veriyi (mesai, FM, izin, departman, vardiya, mevcudiyet, tatil) serbestce ver.

KAVRAMLAR (sorulursa): Plan FM = vardiya planini asan calisma. Yasal FM (4857) = haftalik 45 saati asan. Fazla surelerle calisma = 45 saatin altinda kalan gunluk fazla. FM1/FM2/FM3 = farkli carpanli kategoriler (kesin carpan "Mesai Kurallari"nda). Net = brut - mola. Erken gelme notr. Eksik gun = giris/cikis eksik.

AKIL YURUTME (cikmaza girme, dusun):
- Bir ad ne departman ne kisi diye netse, KORU KORUNE "boyle departman/kisi yok" DEME. Once dogru tabloda ara: kisi gibi gorunen adi calisan_ara, departman gibi gorunen adi departman_listesi ile dogrula. "Huseyincan Orman" gibi ad+soyad neredeyse her zaman bir KISIdir, departman degil.
- departman araci "bulamadim" derse, ayni adi calisan_ara ile KISI olarak dene; eslesirse o kisinin verisini ver. Tersi de gecerli: kisi bulunamazsa departman olabilir.
- Soru birden cok adimsa (orn. "en cok fazla mesai yapan kisi kim"), gereken araclari sirayla cagirip sonuclari KENDIN karsilastirip yorumla; tek bir aracin hazir ciktisini beklemeden mantik kur.
- Gercekten veri yoksa bunu acikca soyle ve ne deneyebilecegini (dogru yazim, ID, departman_listesi) oner; ama veriyi ASLA uydurma.
- Sirket geneli KISI bazli fazla mesai listesi/siralamasi icin "sirket_kisi_fazla_mesai" aracini kullan (orn. "tum calisanlarin fazla mesaisini teker teker", "en cok fazla mesai yapan kisi kim"). Departman TOPLAMI icin departman_aylik_ozet, tek kisi icin kisi_aylik_ozet. Sayilari UYDURMA, araci cagir.
- Puantaj/FM/izin/vardiya kavramlari, sistemin nasil calistigi gibi GENEL sorulara da yardimci ol; sadece tablo okuyan degil, aciklayan ve yorumlayan bir asistansin.

BICIM: Sureleri "X sa Y dk" ver. Kisa, net, profesyonel Turkce; gereksiz dolgu yok. Yil/ay verilmezse bu ayi varsay ve hangi donemi kullandigini belirt."""


def _fold_text(text: str) -> str:
    return " ".join((text or "").translate(_TR_FOLD).lower().split())


def _extract_employee_id(text: str) -> int | None:
    match = _EMPLOYEE_ID_RE.search(text or "")
    if not match:
        return None
    for group in match.groups():
        if group:
            return int(group)
    return None


def _truncate_history_message(role: str, content: str) -> str:
    normalized = " ".join((content or "").strip().split())
    limit = _HISTORY_MESSAGE_CHAR_LIMITS.get(role, 500)
    if len(normalized) <= limit:
        return normalized
    if role == "assistant":
        head_limit = max(120, limit - 160)
        head = normalized[:head_limit].rstrip()
        tail = normalized[-120:].lstrip()
        return f"{head} ... [onceki uzun cevap kisaltildi] ... {tail}"
    return normalized[: limit - 24].rstrip() + " ... [kisaltildi]"


def _prepare_prompt_history(history: list[dict[str, str]], history_limit: int) -> list[dict[str, str]]:
    trimmed = history[-max(2, history_limit):]
    compacted = [
        {"role": msg["role"], "content": _truncate_history_message(msg["role"], msg["content"])}
        for msg in trimmed
    ]
    total_chars = sum(len(msg["content"]) for msg in compacted)
    while total_chars > _HISTORY_TOTAL_CHAR_LIMIT and len(compacted) > 2:
        removed = compacted.pop(0)
        total_chars -= len(removed["content"])
    return compacted


def _sensitive_reply_for(content: str) -> str | None:
    folded = _fold_text(content)
    if any(term in folded for term in _SENSITIVE_LOCATION_TERMS):
        return _SENSITIVE_LOCATION_REPLY
    tokens = re.findall(r"[a-z0-9]+", folded)
    if any(re.search(rf"\b{re.escape(term)}\b", folded) for term in _SENSITIVE_PERSONNEL_TERMS):
        return _SENSITIVE_PERSONNEL_REPLY
    if any(token.startswith(prefix) for token in tokens for prefix in _SENSITIVE_PERSONNEL_PREFIXES):
        return _SENSITIVE_PERSONNEL_REPLY
    return None


def _small_talk_reply_for(content: str) -> str | None:
    folded = _fold_text(content)
    if not folded:
        return None
    words = folded.split()
    if len(words) > 5:
        return None
    if any(pattern in folded for pattern in _SMALL_TALK_PATTERNS):
        return _SMALL_TALK_REPLY
    return None


def _identity_reply_for(content: str) -> str | None:
    """'Sen kimsin / ne yapabilirsin' gibi kimlik sorularini LLM'siz, aninda yanitlar.
    Aksi halde bunlar LLM router'a gidip gereksiz token/429 hatasi uretiyordu."""
    folded = _fold_text(content)
    if not folded or len(folded.split()) > 5:
        return None
    if any(pattern in folded for pattern in _IDENTITY_PATTERNS):
        return _IDENTITY_REPLY
    return None


def _is_company_person_overtime(folded: str) -> bool:
    """Sirket geneli KISI bazli fazla mesai sorusu mu? Iki kalip:
    1) Listeleme: 'tum/butun departmandaki calisanlarin fazla mesaisini teker teker'
    2) Ust derece: 'en cok/az fazla mesai yapan kisi kim' (departman gecmeden).
    Saf departman-toplami sorulari (kisi/calisan kelimesi yok) bunun disindadir."""
    if not folded:
        return False
    has_overtime = any(term in folded for term in _OVERTIME_TERMS)
    if not has_overtime:
        return False
    # "calisan/calisanlarin/kisiler" gibi cekimleri de yakalamak icin alt-dizgi;
    # "kim" yanlis eslesmesin diye (kimlik, ekim...) sadece kelime sinirinda.
    has_person = (
        "calisan" in folded or "personel" in folded or "eleman" in folded
        or "herkes" in folded or "kisi" in folded or re.search(r"\bkim\b", folded) is not None
    )
    has_list = any(term in folded for term in _PERSON_LIST_TERMS)
    has_broad = any(term in folded for term in _BROAD_SCOPE_TERMS)
    has_superlative = any(term in folded for term in _SUPERLATIVE_TERMS)
    if has_person and (has_list or has_broad):
        return True
    if has_superlative and has_person and "departman" not in folded and "bolum" not in folded:
        return True
    return False


def _extract_period(content: str) -> tuple[int, int]:
    now = _now_local()
    year = now.year
    month = now.month
    folded = _fold_text(content)
    for month_name, month_num in _MONTH_NAME_TO_NUM.items():
        if re.search(rf"\b{month_name}\b", folded):
            month = month_num
            break
    year_match = re.search(r"\b(20\d{2})\b", folded)
    if year_match:
        year = int(year_match.group(1))
    elif "gecen ay" in folded:
        if month == 1:
            return year - 1, 12
        return year, month - 1
    return year, month


def _extract_effective_period(history: list[dict[str, str]]) -> tuple[int, int, bool]:
    latest_user = next((msg for msg in reversed(history) if msg["role"] == "user"), None)
    if latest_user is None:
        now = _now_local()
        return now.year, now.month, False
    latest = latest_user["content"]
    latest_folded = _fold_text(latest)
    if _has_explicit_period(latest_folded):
        year, month = _extract_period(latest)
        return year, month, True

    # "Mayis ayi gunluk puantaj" -> "11 id" gibi netlestirme cevaplarinda
    # donemi son kisa cevaptan degil, onceki asil sorudan tasimak gerekir.
    if _extract_employee_id(latest) is not None or len(latest_folded.split()) <= 4:
        user_messages = [message for message in history if message["role"] == "user"]
        for prev in reversed(user_messages[:-1]):
            prev_folded = _fold_text(prev["content"])
            if _has_explicit_period(prev_folded):
                year, month = _extract_period(prev["content"])
                return year, month, True

    year, month = _extract_period(latest)
    return year, month, False


def _extract_target_date(content: str) -> date | None:
    folded = _fold_text(content)
    today = _now_local().date()
    if any(token in folded for token in ("su an", "simdi", "bugun")):
        return today
    if re.search(r"\bdun\b", folded):
        return today - timedelta(days=1)
    if re.search(r"\byarin\b", folded):
        return today + timedelta(days=1)

    match = _DATE_RE.search(folded)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            return None
    match = _TR_DATE_RE.search(folded)
    if match:
        try:
            return date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        except ValueError:
            return None
    match = _DAY_MONTH_RE.search(folded)
    if match:
        month = _MONTH_NAME_TO_NUM.get(match.group(2))
        if month:
            try:
                return date(today.year, month, int(match.group(1)))
            except ValueError:
                return None
    return None


def _looks_like_department_request(content: str) -> bool:
    folded = _fold_text(content)
    return any(hint in folded for hint in _DIRECT_DEPARTMENT_HINTS)


_DEPT_STOPWORDS = frozenset({
    "departman", "departmani", "departmaninda", "departmanin", "departmana", "bolum", "bolumu",
    "bolumunde", "kimler", "kim", "var", "calisanlar", "calisanlari", "calisani", "calisan",
    "calisiyor", "personel", "ekip", "listesi", "listele", "goster", "bana", "hangi", "kac",
    "sayisi", "mesai", "fazla", "vardiya", "vardiyalari", "vardiyasi", "kurallari", "kural",
    "izin", "izinli", "izinler", "ozet", "ozeti", "aylik", "gunluk", "raporu", "rapor", "ne",
    "kadar", "misin", "sunar", "icin", "bu", "ay", "yil", "gecen", "bugun", "su", "anda",
    "iceride", "icerde", "disarida", "disarda", "gelmedi", "gelmeyen", "geldi", "tatil",
    "calismasi", "toplam", "en", "yuksek", "dusuk", "mesaisi", "mesaisini", "mesaisinde",
    "fazlasi", "calisma", "cok", "az", "fazlamesai", "siralama", "siralamasi", "nedir",
    # Cogul/"hepsi" ifadeleri tek bir departman adi degildir; tum-departman sorgusu
    # icin filtreyi None birakmali (yoksa "tum departmanlar" department_id olarak gidip
    # bos yere "bulamadim" + gereksiz arac cagrisi uretiyor).
    "tum", "tumu", "butun", "her", "hepsi", "departmanlar", "departmanlarin", "departmanlari",
})


def _has_explicit_period(folded: str) -> bool:
    if re.search(r"\b20\d{2}\b", folded):
        return True
    if any(re.search(rf"\b{month}\b", folded) for month in _MONTH_NAME_TO_NUM):
        return True
    return any(
        token in folded
        for token in ("bu ay", "gecen ay", "onceki ay", "gelecek ay", "bu yil", "gecen yil")
    )


def _extract_department_query(content: str) -> str | None:
    """Serbest metinden departman adi parcasini ayiklar (orn. 'teknik serviste kimler var'
    -> 'teknik servis'); _resolve_department_id Turkce-duyarli eslestirir."""
    folded = _fold_text(content)
    for month in _MONTH_NAME_TO_NUM:
        folded = re.sub(rf"\b{month}\b", " ", folded)
    folded = re.sub(r"\b20\d{2}\b", " ", folded)
    tokens: list[str] = []
    for raw in folded.split():
        token = re.sub(r"[^a-z0-9]", "", raw)
        if not token or token in _DEPT_STOPWORDS:
            continue
        for suffix in ("ndaki", "daki", "deki", "nda", "nde", "tan", "ten", "dan", "den", "te", "ta", "de", "da"):
            if len(token) > 4 and token.endswith(suffix):
                stem = token[: -len(suffix)]
                token = stem
                break
        token = _strip_turkish_owner_suffix(token)
        if token and token not in _DEPT_STOPWORDS:
            tokens.append(token)
    if not tokens:
        return None
    return " ".join(tokens[:4])


def _strip_turkish_owner_suffix(token: str) -> str:
    """Isimlerdeki basit iyelik/genitif eklerini atar: 'ahmetin', 'ayseenin',
    'caliskanin'. Apostrof kullanilmayinca -nin ile kok sonundaki n cakisir."""
    if len(token) <= 4:
        return token
    for suffix in ("nin", "nun"):
        if token.endswith(suffix):
            buffer_stem = token[: -len(suffix)]
            plain_stem = token[:-2]
            if plain_stem.endswith("n") and len(buffer_stem) >= 6:
                return plain_stem
            if buffer_stem and buffer_stem[-1] in "aeiou":
                return buffer_stem
    for suffix in ("in", "un"):
        if token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _classify_single(content: str) -> str | None:
    """Tek bir mesaji puantaj sistemindeki bir araca esler. Genis Turkce ifade
    sozlugu; eslesme yoksa None. Sira ONEMLI: ozelden genele."""
    f = _fold_text(content)

    def has(*subs: str) -> bool:
        return any(sub in f for sub in subs)

    dept = _looks_like_department_request(f)
    dept_phrase = _extract_department_query(content)

    # 0) Sirket geneli KISI bazli fazla mesai (teker teker / en cok kim).
    # "calisanlarin fazla mesaisini teker teker" gibi ifadeler roster (adim 1)
    # ya da kisi/departman ozeti (adim 11) ile karismasin diye en basta.
    if _is_company_person_overtime(f):
        return "sirket_kisi_fazla_mesai"

    # 1) Departman calisan listesi (roster) - mevcudiyet kontrolunden ONCE
    if (dept or dept_phrase) and has(
        "calisanlar", "calisanlari", "personel", "ekip", "kimler var", "kim var",
        "calisan listesi", "kimler calisiyor", "kadrosu", "kimler bulunuyor",
    ) and dept_phrase:
        return "departman_calisanlari"

    # 2) Bugunku yoklama / mevcudiyet
    if has(
        "kim gelmedi", "gelmeyen", "kim geldi", "kimler geldi", "kimler gelmedi", "kim icerde",
        "kim iceride", "iceride kim", "kim disarda", "kim disarida", "yoklama", "bugun kim",
        "su an kim", "mevcut", "gelmeme riski", "henuz gelmeyen", "henuz giris", "cikis yapan",
        "cikis yapmayan", "isi biten", "isi bitmeyen", "kim calisiyor", "kim iste", "iste kimler",
        "kac kisi geldi", "kac kisi iceride", "devam durumu", "yoklama durumu",
    ):
        return "bugun_durumu"

    # 3) Sirket geneli ozet
    if has(
        "sirket ozeti", "genel ozet", "genel durum", "sirket geneli", "sirket raporu",
        "toplam calisan", "kac calisan", "kac kisi var", "calisan sayisi", "kac personel",
        "genel bilgi", "ozet bilgi",
    ) and not dept:
        return "sirket_ozeti"

    # 4) Resmi tatiller / ozel gunler
    if has("resmi tatil", "tatiller", "tatil gun", "ozel gun", "bayram", "tatil listesi", "hangi gunler tatil"):
        return "resmi_tatiller"

    # 5) Vardiyalar
    if has("vardiya", "vardiyalar", "vardiya saat", "mesai saat", "calisma saat", "vardiya listesi", "shift"):
        return "vardiya_listesi"

    # 6) Mesai kurallari
    if has(
        "mesai kural", "calisma kural", "mola suresi", "mola kac", "tolerans", "planlanan sure",
        "gunluk plan", "calisma kurali", "kural ne",
    ):
        return "mesai_kurallari"

    # 7) Izinler
    if has(
        "izin", "izinli", "izinde", "izinler", "yillik izin", "rapor izni", "raporlu", "mazeret",
        "ucretsiz izin", "izin listesi", "kim izinli", "kimler izinli", "izindekiler",
    ):
        return "izin_listesi"

    # 8) Eksik gunler
    if has(
        "eksik gun", "eksik gunler", "eksik giris", "eksik cikis", "giris cikis eksik",
        "giris eksik", "cikis eksik", "devamsiz", "eksik kayit",
    ):
        return "eksik_gunler"

    # 9) Departman listesi. "tum departmanlarin fazla mesaisi" gibi TOPLU ozet
    # sorularinda buraya takilmamali (fazla mesai/ozet sinyali varsa adim 11'e dussun).
    dept_summary_signal = has(
        "fazla mesai", "mesaisi", "fazla calisma", "ozet", "puantaj", "calisti", "mesai dokumu",
        "fm1", "fm2", "fm3", "ne kadar calis",
    )
    if not dept_summary_signal and has(
        "departman listesi", "departmanlar", "kac departman", "bolum listesi",
        "tum departmanlar", "departmanlari listele",
    ):
        if not dept_phrase or has("listesi", "listele", "kac", "tum", "hepsi"):
            return "departman_listesi"

    # 10) Gun gun puantaj. "gunluk" (gun gun dokum) guclu bir sinyaldir; "aylik"
    # gecmiyorsa tek basina yeterli ("gunluk olarak verisini cikar" gibi ifadeler).
    if has(
        "gunluk puantaj", "gun gun", "gunluk dokum", "gun bazinda", "gunluk giris", "gunluk cikis",
        "gunluk calisma", "hangi gun girdi", "hangi gun cikti", "hangi gun geldi", "gunluk rapor",
        "gunluk veri", "puantaj verisi",
    ) or (re.search(r"\bgunluk\b", f) and "aylik" not in f):
        return None if dept else "gunluk_puantaj"

    # 11) Aylik ozet / fazla mesai / puantaj raporu
    if has(
        "fazla mesai", "aylik ozet", "aylik fazla", "mesaisi ne kadar", "mesai ozeti",
        "puantaj raporu", "puantaj ozeti", "puantajini", "puantaji", "aylik rapor",
        "kac saat calisti", "ne kadar calisti", "toplam calisma", "toplam mesai", "mesai dokumu",
        "fm1", "fm2", "fm3", "fazla calisma", "mesai durumu",
    ):
        return "departman_aylik_ozet" if dept else "kisi_aylik_ozet"

    # 12) Kisi operasyonel detay
    if has(
        "hangi departmanda", "hangi vardiyada", "vardiyasi ne", "izinleri ne", "cihaz",
        "kimdir", "kim bu", "bilgilerini", "bilgileri", "detayini", "detayi", "operasyonel",
        "hangi bolge", "profilini",
    ):
        return "kisi_detay"

    return None


def _infer_direct_intent(history: list[dict[str, str]]) -> str | None:
    """Son mesaji siniflar; eslesmezse ve mesaj bir netlestirme cevabi (ID ya da kisa
    isim/departman) ise onceki niyeti surdurur (orn. 'gunluk puantaj?' -> '11 id')."""
    user_messages = [message for message in history if message["role"] == "user"]
    if not user_messages:
        return None
    latest = user_messages[-1]["content"]
    intent = _classify_single(latest)
    if intent is not None:
        return intent

    folded = _fold_text(latest)
    is_answer = _extract_employee_id(latest) is not None or len(folded.split()) <= 4
    if not is_answer:
        return None
    latest_is_dept = _looks_like_department_request(folded) or bool(_extract_department_query(latest))
    for prev in reversed(user_messages[:-1]):
        prior = _classify_single(prev["content"])
        if prior is None:
            continue
        if latest_is_dept and prior in {"kisi_aylik_ozet", "departman_aylik_ozet"}:
            return "departman_aylik_ozet"
        return prior
    return None


def _duration_text_to_minutes(text: str | None) -> int:
    if not text:
        return 0
    match = re.search(r"(?:(\d+)\s*sa)?\s*(?:(\d+)\s*dk)?", text)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes


def _extract_employee_query(content: str) -> str | None:
    folded = _fold_text(content)
    if _extract_employee_id(folded) is not None:
        return None
    cleaned = folded
    for phrase in (
        "bir calisanin",
        "bir calisan",
        "calisanin",
        "calisan",
        "gunluk olarak",
        "gunluk puantajini",
        "gunluk puantaj",
        "puantaj verisi sunar misin bana",
        "puantaj verisini",
        "puantaj verisi",
        "verisini",
        "verisi",
        "olarak",
        "puantaj raporunu goster",
        "puantaj raporunu",
        "puantaj raporu",
        "puantaj ozeti",
        "puantajini goster",
        "puantajini",
        "puantaji",
        "aylik raporunu",
        "aylik raporu",
        "aylik rapor",
        "eksik gunlerini",
        "eksik gunleri",
        "eksik gunler",
        "eksik gun",
        "izinlerini",
        "izinleri",
        "detayini goster",
        "detayini",
        "detayi",
        "bilgilerini",
        "bilgileri",
        "profilini",
        "kim bu",
        "kimdir",
        "gun gun",
        "fazla mesaisi ne kadar",
        "fazla mesaisi",
        "fazla mesai",
        "mesai dokumu",
        "mesai ozeti",
        "aylik ozet",
        "bu ayki",
        "bu ay",
        "gecen ay",
        "icin",
        "bana",
        "gosterebilir",
        "goster",
        "getirir",
        "getir",
        "cikarabilir",
        "cikarir",
        "cikar",
        "olustur",
        "hazirlar",
        "hazirla",
        "verir",
        "ver",
        "soyler",
        "soyle",
        "soylermisin",
        "bakar",
        "bakabilir",
        "sunar misin",
        "misin",
        "musun",
        "midir",
        "ne kadar",
    ):
        cleaned = cleaned.replace(phrase, " ")
    for month_name in _MONTH_NAME_TO_NUM:
        cleaned = re.sub(rf"\b{month_name}\b", " ", cleaned)
    tokens: list[str] = []
    for raw in cleaned.split():
        token = re.sub(r"[^a-z0-9]", "", raw)
        if len(token) < 2 or token in {"id", "ayi", "ay"}:
            continue
        token = _strip_turkish_owner_suffix(token)
        if token:
            tokens.append(token)
    if not tokens:
        return None
    return " ".join(tokens[:4])


def _run_tool_payload(
    db: Session, name: str, args: dict[str, Any], tool_cache: dict[str, str]
) -> dict[str, Any]:
    try:
        return json.loads(dispatch_tool_cached(db, name, args, tool_cache))
    except Exception:
        logger.exception("assistant_tool_payload_parse_failed", extra={"tool": name})
        return {"hata": "Arac sonucu okunamadi."}


def _format_employee_options(rows: list[dict[str, Any]]) -> str:
    lines = [
        f"- {row.get('ad_soyad')} (ID {row.get('id')}, {row.get('departman') or 'departman yok'})"
        for row in rows[:8]
    ]
    return "\n".join(lines)


def _format_daily_reply(payload: dict[str, Any]) -> str:
    calisan = payload.get("calisan") or {}
    gunler = payload.get("gunler") or []
    header = (
        f"**{calisan.get('ad_soyad', 'Calisan')} - {payload.get('donem', '')}**"
        f" ({calisan.get('departman') or 'Departman yok'})"
    )
    rows = [
        "| Gun | Durum | Giris | Cikis | Net Calisma | Fazla Mesai | Vardiya |",
        "|-----|-------|-------|-------|-------------|-------------|---------|",
    ]
    total_complete = 0
    total_incomplete = 0
    total_leave = 0
    for day in gunler:
        durum = str(day.get("durum") or "-")
        if durum == "tam":
            total_complete += 1
        elif "izin" in durum:
            total_leave += 1
        elif "eksik" in durum:
            total_incomplete += 1
        rows.append(
            "| {gun} | {durum} | {giris} | {cikis} | {net} | {fm} | {vardiya} |".format(
                gun=day.get("gun", "-"),
                durum=durum,
                giris=day.get("giris") or "-",
                cikis=day.get("cikis") or "-",
                net=day.get("net_calisma") or "-",
                fm=day.get("fazla_mesai") or "-",
                vardiya=day.get("vardiya") or "-",
            )
        )
    summary = (
        f"\n\n**Ozet**\n\n- Tam gun: {total_complete}\n- Izinli: {total_leave}\n- Eksik: {total_incomplete}"
    )
    return header + "\n\n" + "\n".join(rows) + summary


def _format_monthly_summary_reply(payload: dict[str, Any]) -> str:
    calisan = payload.get("calisan") or {}
    fm = payload.get("fazla_mesai") or {}
    calisma = payload.get("calisma") or {}
    return (
        f"**{calisan.get('ad_soyad', 'Calisan')} - {payload.get('donem', '')}**"
        f" ({calisan.get('departman') or 'Departman yok'})\n\n"
        f"- Toplam fazla mesai: {fm.get('toplam') or '-'}\n"
        f"- Plan fazla mesai: {fm.get('plan_fazla_mesai') or '-'}\n"
        f"- Yasal fazla mesai: {fm.get('yasal_fazla_mesai') or '-'}\n"
        f"- Fazla surelerle calisma: {fm.get('fazla_surelerle_calisma') or '-'}\n"
        f"- FM1/FM2/FM3: {fm.get('fm1') or '-'} / {fm.get('fm2') or '-'} / {fm.get('fm3') or '-'}\n"
        f"- Net calisma: {calisma.get('net') or '-'}\n"
        f"- Eksik gun: {calisma.get('eksik_gun') or 0}"
    )


def _format_department_monthly_reply(payload: dict[str, Any]) -> str:
    departments = list(payload.get("departmanlar") or [])
    if not departments:
        return "Bu donem icin departman fazla mesai verisi bulunamadi."
    ranked = sorted(
        departments,
        key=lambda row: _duration_text_to_minutes(str(row.get("toplam_fazla_mesai") or "")),
        reverse=True,
    )
    top = ranked[0]
    lines = [
        f"**{payload.get('donem', '')} icin en yuksek fazla mesai: {top.get('ad')}**",
        "",
        f"- Toplam fazla mesai: {top.get('toplam_fazla_mesai') or '-'}",
        f"- Plan fazla mesai: {top.get('plan_fazla_mesai') or '-'}",
        f"- Yasal fazla mesai: {top.get('yasal_fazla_mesai') or '-'}",
        f"- Toplam calisma: {top.get('toplam_calisma') or '-'}",
        f"- Calisan sayisi: {top.get('calisan_sayisi') or 0}",
    ]
    if len(ranked) > 1:
        lines.append("")
        lines.append("Ilk 3 departman:")
        for row in ranked[:3]:
            lines.append(
                f"- {row.get('ad')}: {row.get('toplam_fazla_mesai') or '-'} fazla mesai, {row.get('calisan_sayisi') or 0} calisan"
            )
    return "\n".join(lines)


_COMPANY_PERSON_OVERTIME_MAX = 100


def _format_company_person_overtime_reply(payload: dict[str, Any]) -> str:
    people = list(payload.get("kisiler") or [])
    donem = payload.get("donem", "")
    if not people:
        return f"{donem} icin kisi bazli fazla mesai verisi bulunamadi."
    total = int(payload.get("kisi_sayisi") or len(people))
    extra = 0
    if len(people) > _COMPANY_PERSON_OVERTIME_MAX:
        extra = len(people) - _COMPANY_PERSON_OVERTIME_MAX
        people = people[:_COMPANY_PERSON_OVERTIME_MAX]
    # Kisiler zaten fazla mesaiye gore azalan sirali; departmana gore grupla,
    # departman sirasi ilk gorulen (en yuksek FM'li) kisiye gore korunur.
    groups: dict[str, list[dict[str, Any]]] = {}
    order: list[str] = []
    for p in people:
        d = str(p.get("departman") or "Departmansiz")
        if d not in groups:
            groups[d] = []
            order.append(d)
        groups[d].append(p)
    lines = [f"**{donem} - kisi bazli fazla mesai** ({total} kisi)", ""]
    for d in order:
        lines.append(f"_{d}_")
        for p in groups[d]:
            lines.append(f"- {p.get('ad_soyad')}: {p.get('fazla_mesai') or '-'}")
        lines.append("")
    reply = "\n".join(lines).rstrip()
    if extra:
        reply += f"\n\n(En yuksek {_COMPANY_PERSON_OVERTIME_MAX} kisi gosterildi, {extra} kisi daha var.)"
    return reply


def _format_company_reply(payload: dict[str, Any]) -> str:
    c = payload.get("calisanlar") or {}
    b = payload.get("bugun") or {}
    return (
        "**Sirket Ozeti**\n\n"
        f"- Toplam calisan: {c.get('toplam', 0)} (aktif {c.get('aktif', 0)})\n"
        f"- Departman: {payload.get('departman_sayisi', 0)} | Bolge: {payload.get('bolge_sayisi', 0)}\n\n"
        f"**Bugun ({b.get('tarih', '-')})**\n"
        f"- Calisiyor: {b.get('calisiyor', 0)} | Isi bitti: {b.get('isi_bitti', 0)}\n"
        f"- Gelmedi: {b.get('gelmedi', 0)} | Henuz giris yok: {b.get('henuz_giris_yok', 0)} | Tatil/izin: {b.get('tatil_izin', 0)}"
    )


def _format_department_list_reply(payload: dict[str, Any]) -> str:
    deps = payload.get("departmanlar") or []
    if not deps:
        return "Tanimli departman bulunamadi."
    lines = ["**Departmanlar**", ""]
    for d in deps:
        lines.append(
            f"- {d.get('ad')} ({d.get('bolge') or 'bolge yok'}): "
            f"{d.get('aktif_calisan', 0)}/{d.get('calisan_sayisi', 0)} aktif calisan"
        )
    return "\n".join(lines)


def _format_holidays_reply(payload: dict[str, Any]) -> str:
    days = payload.get("ozel_gunler") or []
    if not days:
        return "Tanimli resmi tatil / ozel gun bulunamadi."
    lines = ["**Resmi Tatiller / Ozel Gunler**", ""]
    for g in days[:60]:
        tur = f" ({g.get('tur')})" if g.get("tur") else ""
        lines.append(f"- {g.get('tarih')}: {g.get('ad')}{tur}")
    return "\n".join(lines)


_BOARD_GROUP_ORDER = (
    "calisiyor (icerde)",
    "isi bitti (cikti)",
    "gelmedi",
    "gelmeme riski",
    "henuz giris yok",
    "cikis yapmadi (acik)",
    "tatil/izinli (calisma gunu degil)",
)


def _format_board_reply(payload: dict[str, Any]) -> str:
    o = payload.get("ozet") or {}
    people = payload.get("kisiler") or []
    head = f"**Yoklama - {payload.get('tarih', '-')}**\n\n"
    summary = (
        f"- Toplam: {o.get('toplam', 0)} | Calisiyor: {o.get('calisiyor', 0)} | Isi bitti: {o.get('isi_bitti', 0)}\n"
        f"- Gelmedi: {o.get('gelmedi', 0)} | Gelmeme riski: {o.get('gelmeme_riski', 0)} | "
        f"Henuz giris yok: {o.get('henuz_giris_yok', 0)} | Tatil/izin: {o.get('tatil_izin', 0)}"
    )
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in people:
        groups.setdefault(str(row.get("durum") or "-"), []).append(row)
    sections: list[str] = []
    for status in _BOARD_GROUP_ORDER:
        rows = groups.get(status)
        if not rows:
            continue
        block = [f"\n**{status.capitalize()}** ({len(rows)})"]
        for r in rows[:40]:
            giris = r.get("giris")
            block.append(f"- {r.get('ad')} - {r.get('departman') or '-'}" + (f" ({giris})" if giris else ""))
        sections.append("\n".join(block))
    out = head + summary + ("\n" + "\n".join(sections) if sections else "")
    if payload.get("not"):
        out += f"\n\n_{payload['not']}_"
    return out


def _format_shifts_reply(payload: dict[str, Any]) -> str:
    shifts = payload.get("vardiyalar") or []
    if not shifts:
        return "Tanimli vardiya bulunamadi."
    lines = ["**Vardiyalar**", ""]
    for s in shifts:
        lines.append(
            f"- {s.get('ad')} ({s.get('departman') or '-'}): "
            f"{s.get('baslangic')}-{s.get('bitis')}, mola {s.get('mola_dk', 0)} dk"
        )
    return "\n".join(lines)


def _format_workrules_reply(payload: dict[str, Any]) -> str:
    rules = payload.get("mesai_kurallari") or []
    if not rules:
        return "Tanimli mesai kurali bulunamadi."
    lines = ["**Mesai Kurallari**", ""]
    for k in rules:
        lines.append(
            f"- {k.get('departman') or '-'}: gunluk {k.get('gunluk_planlanan') or '-'}, "
            f"mola {k.get('mola_dk', 0)} dk, giris toleransi {k.get('giris_tolerans_dk', 0)} dk, "
            f"FM toleransi {k.get('fazla_mesai_tolerans_dk', 0)} dk"
        )
    return "\n".join(lines)


def _format_department_employees_reply(payload: dict[str, Any]) -> str:
    emps = payload.get("calisanlar") or []
    head = f"**{payload.get('departman', 'Departman')} - {payload.get('adet', len(emps))} calisan**\n\n"
    if not emps:
        return head + "Bu departmanda aktif calisan bulunamadi."
    lines = []
    for e in emps:
        vardiya = f" - {e.get('vardiya')}" if e.get("vardiya") else ""
        pasif = "" if e.get("aktif", True) else " [pasif]"
        lines.append(f"- {e.get('ad_soyad')} (ID {e.get('id')}){vardiya}{pasif}")
    return head + "\n".join(lines)


def _format_leaves_reply(payload: dict[str, Any]) -> str:
    leaves = payload.get("izinler") or []
    head = (
        f"**Izinler ({payload.get('durum_filtresi', 'onayli')}, {payload.get('donem', '-')}) - "
        f"{payload.get('adet', len(leaves))} kayit**\n\n"
    )
    if not leaves:
        return head + "Bu kritere uyan izin bulunamadi."
    lines = []
    for i in leaves[:60]:
        half = " (yarim gun)" if i.get("yarim_gun") else ""
        lines.append(
            f"- {i.get('calisan')} ({i.get('departman') or '-'}): "
            f"{i.get('tur')} {i.get('baslangic')} -> {i.get('bitis')}{half}"
        )
    return head + "\n".join(lines)


def _format_person_detail_reply(payload: dict[str, Any]) -> str:
    k = payload.get("kimlik") or {}
    ci = payload.get("cihazlar") or {}
    mk = payload.get("mesai_kurali")
    lines = [
        f"**{k.get('ad_soyad', 'Calisan')} (ID {k.get('id')})**",
        "",
        f"- Departman: {k.get('departman') or '-'}",
        f"- Bolge: {k.get('bolge') or '-'}",
        f"- Vardiya: {k.get('vardiya') or '-'}",
        f"- Aktif: {'evet' if k.get('aktif') else 'hayir'}",
    ]
    if k.get("haftalik_sozlesme_saati"):
        lines.append(f"- Haftalik sozlesme: {k['haftalik_sozlesme_saati']} sa")
    lines.append(f"- Cihaz: {ci.get('aktif', 0)}/{ci.get('toplam', 0)} aktif")
    if mk:
        lines.append(
            f"- Mesai kurali: gunluk {mk.get('gunluk_planlanan_dk', '-')} dk, mola {mk.get('mola_dk', '-')} dk"
        )
    leaves = payload.get("izinler") or []
    if leaves:
        lines.append("\n**Son izinler:**")
        for i in leaves[:5]:
            lines.append(f"- {i.get('tur')}: {i.get('baslangic')} -> {i.get('bitis')} ({i.get('durum')})")
    lines.append("\n_Ozluk ve konum bilgisi paylasilmaz._")
    return "\n".join(lines)


def _format_missing_days_reply(payload: dict[str, Any]) -> str:
    c = payload.get("calisan") or {}
    days = payload.get("gunler") or []
    head = (
        f"**{c.get('ad_soyad', 'Calisan')} - {payload.get('donem', '')} eksik gunler "
        f"({payload.get('eksik_gun_sayisi', len(days))})**\n\n"
    )
    if not days:
        return head + "Bu donemde eksik gun bulunmuyor."
    lines = []
    for g in days:
        giris = f" giris {g.get('giris')}" if g.get("giris") else ""
        cikis = f" cikis {g.get('cikis')}" if g.get("cikis") else ""
        lines.append(f"- {g.get('gun')}: {g.get('eksik')}{giris}{cikis}".rstrip())
    return head + "\n".join(lines)


_PERSON_INTENTS = frozenset({"kisi_detay", "eksik_gunler", "gunluk_puantaj", "kisi_aylik_ozet"})
_EXECUTABLE_INTENTS = frozenset({
    "sirket_ozeti", "departman_listesi", "resmi_tatiller", "bugun_durumu", "vardiya_listesi",
    "mesai_kurallari", "departman_calisanlari", "departman_aylik_ozet", "izin_listesi",
    "kisi_detay", "eksik_gunler", "gunluk_puantaj", "kisi_aylik_ozet",
})
_PERSON_CLARIFY_PROMPTS = {
    "gunluk_puantaj": "Hangi calisanin gunluk puantajini gormek istediginizi belirtir misiniz? (Isim ya da calisan ID girebilirsiniz.)",
    "kisi_aylik_ozet": "Hangi calisanin aylik fazla mesaisini istediginizi belirtir misiniz? (Isim ya da calisan ID girebilirsiniz.)",
    "eksik_gunler": "Hangi calisanin eksik gunlerini gormek istediginizi belirtir misiniz? (Isim ya da calisan ID girebilirsiniz.)",
    "kisi_detay": "Hangi calisanin bilgilerini gormek istediginizi belirtir misiniz? (Isim ya da calisan ID girebilirsiniz.)",
}


def _is_not_found_error(text: str) -> bool:
    """Departman/kisi cozumleyici 'bulamadim/bulunamadi' tarzi bir cikmaz mi dondurdu?
    (Coklu eslesme ya da gecici arac hatasi degil; onlarda yeniden degerlendirme yapilmaz.)"""
    t = (text or "").lower()
    return ("bulamadim" in t or "bulunamadi" in t) and "birden fazla" not in t


def _execute_intent(
    db: Session,
    model: str,
    intent: str,
    *,
    employee_id: int | None = None,
    employee_query: str | None = None,
    department_query: str | None = None,
    year: int,
    month: int,
    target_date: date | None = None,
    explicit_period: bool,
    fallthrough_on_not_found: bool = False,
) -> dict[str, Any] | None:
    """Cozulmus niyet + varlik(lar)dan deterministik olarak araci calistirip cevabi
    bicimlendirir. Hem anahtar-kelime hizli yolu hem de LLM yonlendirici bunu kullanir;
    LLM cevabi uydurmaz, yalnizca {niyet, kisi, departman, donem} cikarir."""
    cache: dict[str, str] = {}

    def done(reply: str, tools: list[str]) -> dict[str, Any]:
        return {"reply": reply, "tool_calls": tools, "usage": assistant_usage_payload(db, model)}

    def run(name: str, args: dict[str, Any]) -> dict[str, Any]:
        return _run_tool_payload(db, name, args, cache)

    def person_pivot(query: str | None, person_intent: str) -> dict[str, Any] | None:
        """Departman cozulemedi; sorgu aslinda bir KISI adi olabilir
        (orn. 'Huseyincan Orman'). Tek kisi eslesirse o kisinin person_intent
        cevabini dondurur; coklu ise netlestirme ister; eslesme yoksa None."""
        if not query:
            return None
        search = run("calisan_ara", {"query": query, "include_inactive": False})
        matches = search.get("calisanlar") or []
        if search.get("count") == 1 and matches:
            return _execute_intent(
                db,
                model,
                person_intent,
                employee_id=int(matches[0]["id"]),
                year=year,
                month=month,
                explicit_period=explicit_period,
            )
        if len(matches) > 1:
            return done(
                "Birden fazla calisan bulundu. ID ile netlestirin:\n"
                + _format_employee_options(matches),
                ["calisan_ara"],
            )
        return None

    # --- Entity gerektirmeyen ya da departmani disaridan alan niyetler ---
    if intent == "sirket_ozeti":
        return done(_format_company_reply(run("sirket_ozeti", {})), ["sirket_ozeti"])
    if intent == "departman_listesi":
        return done(_format_department_list_reply(run("departman_listesi", {})), ["departman_listesi"])
    if intent == "resmi_tatiller":
        return done(
            _format_holidays_reply(run("resmi_tatiller", {"year": year} if explicit_period else {})),
            ["resmi_tatiller"],
        )
    if intent == "bugun_durumu":
        args: dict[str, Any] = {}
        if department_query:
            args["department_id"] = department_query
        if target_date is not None:
            args["target_date"] = target_date.isoformat()
        payload = run("bugun_durumu", args)
        if payload.get("hata"):
            return done(str(payload["hata"]), ["bugun_durumu"])
        return done(_format_board_reply(payload), ["bugun_durumu"])
    if intent == "vardiya_listesi":
        payload = run("vardiya_listesi", {"department_id": department_query} if department_query else {})
        if payload.get("hata"):
            if _is_not_found_error(str(payload["hata"])):
                pivot = person_pivot(department_query, "kisi_detay")
                if pivot is not None:
                    return pivot
                if fallthrough_on_not_found:
                    return None
            return done(str(payload["hata"]), ["vardiya_listesi"])
        return done(_format_shifts_reply(payload), ["vardiya_listesi"])
    if intent == "mesai_kurallari":
        payload = run("mesai_kurallari", {"department_id": department_query} if department_query else {})
        if payload.get("hata"):
            if _is_not_found_error(str(payload["hata"])):
                pivot = person_pivot(department_query, "kisi_detay")
                if pivot is not None:
                    return pivot
                if fallthrough_on_not_found:
                    return None
            return done(str(payload["hata"]), ["mesai_kurallari"])
        return done(_format_workrules_reply(payload), ["mesai_kurallari"])
    if intent == "departman_calisanlari":
        if not department_query:
            return done("Hangi departmani kastettiginizi yazar misiniz?", [])
        payload = run("departman_calisanlari", {"department_id": department_query})
        if payload.get("hata"):
            if _is_not_found_error(str(payload["hata"])):
                # 'X departmaninda kimler' ama X aslinda bir KISI olabilir:
                # o kisiyi ve departmanini goster, "boyle departman yok" deme.
                pivot = person_pivot(department_query, "kisi_detay")
                if pivot is not None:
                    return pivot
                if fallthrough_on_not_found:
                    return None
            return done(str(payload["hata"]), ["departman_calisanlari"])
        return done(_format_department_employees_reply(payload), ["departman_calisanlari"])
    if intent == "departman_aylik_ozet":
        args: dict[str, Any] = {"year": year, "month": month}
        if department_query:
            args["department_id"] = department_query
        payload = run("departman_aylik_ozet", args)
        if payload.get("hata") and department_query:
            if _is_not_found_error(str(payload["hata"])):
                # Once: sorgu aslinda bir KISI olabilir (orn. "Huseyincan Orman
                # fazla mesaisi"). Tek kisi eslesirse onun aylik ozetine don.
                pivot = person_pivot(department_query, "kisi_aylik_ozet")
                if pivot is not None:
                    return pivot
            # Kisi de degil: cogu zaman "hangi departmanin fazla mesaisi en yuksek"
            # gibi bir SIRALAMA sorusunda yanlis ayiklanan kelime ("mesaisi").
            # Filtreyi dusur, tum departmanlari sirala (sorulan da budur).
            payload = run("departman_aylik_ozet", {"year": year, "month": month})
        if payload.get("hata"):
            return done(str(payload["hata"]), ["departman_aylik_ozet"])
        return done(_format_department_monthly_reply(payload), ["departman_aylik_ozet"])
    if intent == "sirket_kisi_fazla_mesai":
        args: dict[str, Any] = {"year": year, "month": month}
        # "teker teker", "kisi bazli" gibi listeleme kaliplari yanlislikla departman
        # adi olarak ayiklanabilir; bunlari departman filtresi olarak kullanma.
        dept_q = department_query
        if dept_q and any(t in _fold_text(dept_q) for t in _PERSON_LIST_TERMS):
            dept_q = None
        if dept_q:
            args["department_id"] = dept_q
        payload = run("sirket_kisi_fazla_mesai", args)
        if payload.get("hata") and dept_q and _is_not_found_error(str(payload["hata"])):
            # Departman degil de tek bir KISI kastedilmis olabilir.
            pivot = person_pivot(dept_q, "kisi_aylik_ozet")
            if pivot is not None:
                return pivot
            # Departman cozulemedi: tum sirketi listele (sorulan da budur).
            payload = run("sirket_kisi_fazla_mesai", {"year": year, "month": month})
        if payload.get("hata"):
            return done(str(payload["hata"]), ["sirket_kisi_fazla_mesai"])
        return done(_format_company_person_overtime_reply(payload), ["sirket_kisi_fazla_mesai"])
    if intent == "izin_listesi":
        leave_args: dict[str, Any] = {}
        if department_query:
            leave_args["department_id"] = department_query
        if explicit_period:
            leave_args["year"] = year
            leave_args["month"] = month
        if employee_id is not None:
            leave_args["employee_id"] = employee_id
        payload = run("izin_listesi", leave_args)
        if payload.get("hata"):
            return done(str(payload["hata"]), ["izin_listesi"])
        return done(_format_leaves_reply(payload), ["izin_listesi"])

    if intent not in _PERSON_INTENTS:
        return None

    # --- Kisi gerektiren niyetler ---
    if employee_id is None and not employee_query:
        return done(
            _PERSON_CLARIFY_PROMPTS.get(
                intent, "Hangi calisani kastettiginizi yazar misiniz? (Isim ya da calisan ID girebilirsiniz.)"
            ),
            [],
        )

    if employee_id is None and employee_query:
        search_payload = run("calisan_ara", {"query": employee_query, "include_inactive": False})
        matches = search_payload.get("calisanlar") or []
        if search_payload.get("count") == 1 and matches:
            employee_id = int(matches[0]["id"])
        elif matches:
            return done(
                "Birden fazla calisan bulundu. ID ile netlestirin:\n" + _format_employee_options(matches),
                ["calisan_ara"],
            )
        else:
            # Calisan bulunamadi: aylik niyette sorgu bir DEPARTMAN adi olabilir
            # (orn. "teknik servisin fazla mesaisi" - 'departman' kelimesi gecmeden).
            if intent == "kisi_aylik_ozet":
                dept_try = run(
                    "departman_aylik_ozet",
                    {"year": year, "month": month, "department_id": employee_query},
                )
                if not dept_try.get("hata") and dept_try.get("departmanlar"):
                    return done(_format_department_monthly_reply(dept_try), ["departman_aylik_ozet"])
            if fallthrough_on_not_found:
                # Anahtar-kelime yolu ismi temiz cikaramadi; LLM yonlendirici denesin.
                return None
            return done(
                "Calisan ya da departman bulunamadi. Ismi daha net yazin ya da dogrudan calisan ID girin.",
                ["calisan_ara"],
            )

    if employee_id is None:
        return None

    if intent == "kisi_detay":
        payload = run("kisi_detay", {"employee_id": employee_id})
        if payload.get("hata"):
            return done(str(payload["hata"]), ["kisi_detay"])
        return done(_format_person_detail_reply(payload), ["kisi_detay"])
    if intent == "eksik_gunler":
        payload = run("eksik_gunler", {"employee_id": employee_id, "year": year, "month": month})
        if payload.get("hata"):
            return done(str(payload["hata"]), ["eksik_gunler"])
        return done(_format_missing_days_reply(payload), ["eksik_gunler"])
    if intent == "gunluk_puantaj":
        payload = run("gunluk_puantaj", {"employee_id": employee_id, "year": year, "month": month})
        if payload.get("hata"):
            return done(str(payload["hata"]), ["gunluk_puantaj"])
        return done(_format_daily_reply(payload), ["gunluk_puantaj"])

    payload = run("kisi_aylik_ozet", {"employee_id": employee_id, "year": year, "month": month})
    if payload.get("hata"):
        return done(str(payload["hata"]), ["kisi_aylik_ozet"])
    return done(_format_monthly_summary_reply(payload), ["kisi_aylik_ozet"])


_ASSISTANT_HEADER_NAME_RE = re.compile(r"\*\*(.+?)\s*(?:-|\(ID)")
# Kisi adi yerine gecen, formatlayicilarin urettigi yer tutucu basliklar.
_HEADER_PLACEHOLDER_NAMES = frozenset({
    "calisan", "departman", "departmanlar", "sirket ozeti", "vardiyalar", "izinler",
    "yoklama", "mesai kurallari", "resmi tatiller", "ozet",
})


def _carry_employee_from_history(history: list[dict[str, str]]) -> tuple[int | None, str | None]:
    """Son mesajda kisi yoksa (orn. 'gun gun', 'detayini ver') onceki turlardan EN SON
    calisan baglamini tasi. Eskiden->yeniden tek tarama; ilk bulunan (en yeni) kazanir,
    boylece kisi degisince eski kisiye takilmaz. Asistan cevabi basligindaki temiz isim
    (orn. '**Ercument Caliskan - 2026-06**') guvenilir kaynaktir."""
    for msg in reversed(history[:-1]):
        content = msg.get("content") or ""
        if msg["role"] == "user":
            eid = _extract_employee_id(content)
            if eid is not None:
                return eid, None
            query = _extract_employee_query(content)
            if query:
                return None, query
        else:
            match = _ASSISTANT_HEADER_NAME_RE.search(content)
            if match:
                name = _fold_text(match.group(1))
                if name and name not in _HEADER_PLACEHOLDER_NAMES:
                    return None, name
    return None, None


def _try_direct_assistant_reply(
    db: Session,
    history: list[dict[str, str]],
    model: str,
) -> dict[str, Any] | None:
    """Anahtar-kelime hizli yolu: yaygin kaliplari LLM'siz, aninda yanitlar."""
    latest_user = next((msg for msg in reversed(history) if msg["role"] == "user"), None)
    if latest_user is None:
        return None
    sensitive_reply = _sensitive_reply_for(latest_user["content"])
    if sensitive_reply is not None:
        return {
            "reply": sensitive_reply,
            "tool_calls": [],
            "usage": assistant_usage_payload(db, model),
        }
    identity_reply = _identity_reply_for(latest_user["content"])
    if identity_reply is not None:
        return {
            "reply": identity_reply,
            "tool_calls": [],
            "usage": assistant_usage_payload(db, model),
        }
    small_talk_reply = _small_talk_reply_for(latest_user["content"])
    if small_talk_reply is not None:
        return {
            "reply": small_talk_reply,
            "tool_calls": [],
            "usage": assistant_usage_payload(db, model),
        }
    intent = _infer_direct_intent(history)
    if intent is None:
        return None

    content = latest_user["content"]
    folded = _fold_text(content)
    year, month, explicit_period = _extract_effective_period(history)
    employee_id = _extract_employee_id(content)
    employee_query = None if employee_id is not None else _extract_employee_query(content)
    if employee_id is None and not employee_query and intent in _PERSON_INTENTS:
        # 'gun gun', 'detayini ver' gibi kisa devam mesajlari: kisiyi onceki turdan tasi.
        employee_id, employee_query = _carry_employee_from_history(history)
    return _execute_intent(
        db,
        model,
        intent,
        employee_id=employee_id,
        employee_query=employee_query,
        department_query=_extract_department_query(content),
        target_date=_extract_target_date(content),
        year=year,
        month=month,
        explicit_period=explicit_period or _has_explicit_period(folded),
        fallthrough_on_not_found=True,
    )


# --- LLM niyet yonlendirici: anahtar-kelime tutmazsa tek, hizli bir cagri ile
# niyeti + varliklari (kisi/departman/donem) cozer. Tam ajan dongusu degil: arac
# secimini ve metni LLM uretmez; yalniz JSON cikarir, sonra deterministik calisir.
_ROUTER_INTENT_LIST = (
    "bugun_durumu", "sirket_ozeti", "departman_listesi", "departman_calisanlari",
    "departman_aylik_ozet", "sirket_kisi_fazla_mesai", "vardiya_listesi", "mesai_kurallari",
    "resmi_tatiller", "izin_listesi", "eksik_gunler", "gunluk_puantaj", "kisi_aylik_ozet",
    "kisi_detay", "none",
)


def _router_system_prompt() -> str:
    now = _now_local()
    return (
        "Sen bir IK puantaj asistaninin niyet yonlendiricisisin. Kullanicinin SON mesajini "
        f"(gerekirse onceki mesajlardan baglamla) bir niyete ve varliklara esle. BUGUN {now:%Y-%m-%d}, "
        f"bu ay {now.year}-{now.month:02d}.\n\n"
        "SADECE tek satir JSON dondur, aciklama yok:\n"
        '{"intent": <deger>, "employee": <isim ya da ID ya da null>, "department": <ad ya da null>, '
        '"year": <yil ya da null>, "month": <1-12 ya da null>, "target_date": <YYYY-MM-DD ya da null>}\n\n'
        "intent su degerlerden BIRI olmali:\n"
        "- bugun_durumu: bugun kim geldi/gelmedi/icerde/disarda, yoklama, mevcudiyet\n"
        "- sirket_ozeti: sirket geneli, toplam calisan sayisi, genel durum\n"
        "- departman_listesi: tum departmanlar / departman sayisi\n"
        "- departman_calisanlari: belirli bir departmandaki kisiler (department doldur)\n"
        "- departman_aylik_ozet: departman(lar) bazinda aylik fazla mesai TOPLAMI\n"
        "- sirket_kisi_fazla_mesai: sirket geneli HER calisanin fazla mesaisi KISI BAZLI liste/siralama "
        "('teker teker', 'tum calisanlar', 'en cok fazla mesai yapan kisi'); tek departmana daraltilacaksa department doldur\n"
        "- vardiya_listesi: vardiyalar/calisma saatleri\n"
        "- mesai_kurallari: mola, tolerans, planlanan sure kurallari\n"
        "- resmi_tatiller: resmi tatil/bayram/ozel gun\n"
        "- izin_listesi: izinli kisiler / izin kayitlari\n"
        "- eksik_gunler: bir kisinin eksik giris/cikis gunleri (employee doldur)\n"
        "- gunluk_puantaj: bir kisinin gun gun puantaj dokumu (employee doldur)\n"
        "- kisi_aylik_ozet: bir kisinin aylik fazla mesai/calisma toplami (employee doldur)\n"
        "- kisi_detay: bir kisinin departman/vardiya/cihaz/izin gibi operasyonel bilgisi (employee doldur)\n"
        "- none: selam/tesekkur, alakasiz, ozluk (TC, maas, dogum, banka...) ya da konum sorulari, "
        "ya da emin olmadigin her sey\n\n"
        "KURALLAR:\n"
        "- 'gunluk', 'gun gun', 'gunluk olarak', 'her gun' gecerse intent=gunluk_puantaj; "
        "'toplam', 'aylik', 'ay ici', 'ne kadar fazla mesai' gibi ifadelerde intent=kisi_aylik_ozet. "
        "'rapor/veri cikar' tek basina aylik DEMEK DEGILDIR; 'gunluk' varsa gunluk_puantaj sec.\n"
        "- 'onun, onlarin, bu kisinin, ayni kisi' gibi ifadelerde ya da kisa devam mesajlarinda "
        "('gun gun', 'detayini ver', 'eksik gunleri') employee'yi onceki mesajdaki/cevaptaki kisiden doldur.\n"
        "- employee: kisi adi geciyorsa adi (ek almadan, orn. 'Ercument Caliskan'); sayi/ID verildiyse sayi; yoksa null.\n"
        "- department: departman adi geciyorsa adi; yoksa null.\n"
        "- year/month yalniz mesajda acikca belirtilmisse doldur; yoksa null (varsayilan bu ay).\n"
        "- target_date yalniz yoklama/mevcudiyet sorularinda tarih belirtilmisse doldur; "
        "'bugun', 'dun', 'yarin' gibi ifadeleri YYYY-MM-DD'ye cevir.\n"
        "- Tereddut edersen intent=none. Veriyi ASLA uydurma; sadece siniflandir."
    )


def _route_with_llm(
    client: Any, config: EffectiveAssistantConfig, settings: Any, history: list[dict[str, str]]
) -> tuple[dict[str, Any] | None, int]:
    """Tek bir hizli LLM cagrisiyla niyet+varlik JSON'u cikarir. (route, token) doner;
    cagri ya da JSON cozumlemesi basarisizsa (None, token)."""
    trimmed = _prepare_prompt_history(history, settings.assistant_history_limit)
    messages: list[dict[str, Any]] = [{"role": "system", "content": _router_system_prompt()}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in trimmed)
    try:
        response = _invoke_with_llm_retries(
            lambda: client.chat.completions.create(
                model=config.model,
                messages=messages,
                temperature=0,
                max_tokens=160,
                response_format={"type": "json_object"},
            ),
            model=config.model,
        )
    except Exception:
        logger.warning("assistant_router_call_failed", extra={"model": config.model})
        return None, 0
    usage_obj = getattr(response, "usage", None)
    tokens = int(getattr(usage_obj, "total_tokens", 0) or 0)
    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("assistant_router_parse_failed", extra={"model": config.model})
        return None, tokens
    if not isinstance(data, dict):
        return None, tokens
    return data, tokens


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _dispatch_llm_route(db: Session, model: str, route: dict[str, Any]) -> dict[str, Any] | None:
    """LLM yonlendiricinin cikardigi JSON'u deterministik calistiriciya cevirir."""
    intent = route.get("intent")
    if intent not in _EXECUTABLE_INTENTS:
        return None

    employee_id: int | None = None
    employee_query: str | None = None
    emp = route.get("employee")
    if emp is not None:
        emp_id = _coerce_int(emp)
        if emp_id is not None:
            employee_id = emp_id
        else:
            folded = _fold_text(str(emp))
            employee_query = folded or None

    dept = route.get("department")
    department_query = _fold_text(str(dept)) or None if dept else None

    now = _now_local()
    year = _coerce_int(route.get("year"))
    month = _coerce_int(route.get("month"))
    explicit_period = year is not None or month is not None
    if month is None or not (1 <= month <= 12):
        month = now.month
        explicit_period = year is not None
    if year is None:
        year = now.year

    target_date: date | None = None
    raw_target_date = route.get("target_date")
    if isinstance(raw_target_date, str) and raw_target_date.strip():
        try:
            target_date = date.fromisoformat(raw_target_date.strip()[:10])
        except ValueError:
            target_date = None

    return _execute_intent(
        db,
        model,
        intent,
        employee_id=employee_id,
        employee_query=employee_query,
        department_query=department_query,
        target_date=target_date,
        year=year,
        month=month,
        explicit_period=explicit_period,
        # Varlik (kisi/departman) cozulemezse cikmaz cevap verme; tam ajan
        # dongusune dus de model akil yursutup arac secsin ("duvar"i kaldir).
        fallthrough_on_not_found=True,
    )


def _is_rate_limit_error(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    text = str(exc).lower()
    return status == 429 or "rate_limit" in text or "429" in text


def _is_daily_rate_limit_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "per day" in text or "tpd" in text or "rpd" in text


def _extract_retry_after_seconds(exc: Exception) -> float | None:
    text = str(exc).lower()
    match = _RETRY_AFTER_PATTERN.search(text)
    if not match:
        return None
    total_seconds = 0.0
    for value_text, unit in _RETRY_AFTER_TOKEN_PATTERN.findall(match.group(1)):
        value = float(value_text)
        if unit == "h":
            total_seconds += value * 3600
        elif unit == "m":
            total_seconds += value * 60
        elif unit == "s":
            total_seconds += value
        elif unit == "ms":
            total_seconds += value / 1000
    return total_seconds or None


def _format_retry_after_hint(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    rounded = max(1, math.ceil(seconds))
    hours, remainder = divmod(rounded, 3600)
    minutes, secs = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours} sa")
    if minutes:
        parts.append(f"{minutes} dk")
    if secs or not parts:
        parts.append(f"{secs} sn")
    return " ".join(parts)


def _burst_rate_limit_retry_delay(exc: Exception) -> float | None:
    if not _is_rate_limit_error(exc) or _is_daily_rate_limit_error(exc):
        return None
    retry_after = _extract_retry_after_seconds(exc)
    if retry_after is None or retry_after > _BURST_RATE_LIMIT_AUTO_RETRY_MAX_SECONDS:
        return None
    return max(retry_after, _BURST_RATE_LIMIT_AUTO_RETRY_MIN_SECONDS)


def _invoke_with_llm_retries(request_fn: Callable[[], Any], *, model: str) -> Any:
    transient_retry_used = False
    burst_retry_used = False
    while True:
        try:
            return request_fn()
        except Exception as exc:
            if not transient_retry_used and _is_transient_tool_error(exc):
                transient_retry_used = True
                logger.warning("assistant_tool_call_retry", extra={"model": model})
                continue
            retry_delay = _burst_rate_limit_retry_delay(exc)
            if not burst_retry_used and retry_delay is not None:
                burst_retry_used = True
                logger.warning(
                    "assistant_rate_limit_retry",
                    extra={"model": model, "delay_seconds": round(retry_delay, 3)},
                )
                time.sleep(retry_delay)
                continue
            raise


def _create_completion(client: Any, config: EffectiveAssistantConfig, settings: Any, messages: list[dict[str, Any]]) -> Any:
    """LLM cagrisi. Gecici tool-call hatasi veya cok kisa burst 429 gelirse bir kez toparlar."""
    return _invoke_with_llm_retries(
        lambda: client.chat.completions.create(
            model=config.model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=settings.assistant_temperature,
        ),
        model=config.model,
    )


def _map_llm_error(model: str, exc: Exception) -> ApiError:
    """Ham LLM/Groq hatasini kullaniciya sizdirmadan anlasilir Turkce mesaja cevirir."""
    logger.exception("assistant_llm_failed", extra={"model": model})
    text = str(exc).lower()
    status = getattr(exc, "status_code", None)
    if _is_rate_limit_error(exc):
        # Groq 429 iki turlu: gunluk (TPD/RPD) tukenme vs gecici dakikalik (TPM/RPM) yogunluk.
        # Hepsini "gunluk doldu" demek kullaniciyi bos yere model degistirmeye itiyor.
        if _is_daily_rate_limit_error(exc):
            return ApiError(
                status_code=503,
                code="ASSISTANT_RATE_LIMIT",
                message=(
                    f"'{model}' modelinin GUNLUK ucretsiz token limiti doldu. "
                    "Ayarlar (disli) > Model'den baska bir model secin (orn. llama-3.1-8b-instant) "
                    "ya da yarin tekrar deneyin."
                ),
            )
        retry_hint = _format_retry_after_hint(_extract_retry_after_seconds(exc))
        hint = f" (yaklasik {retry_hint} sonra)" if retry_hint else ""
        return ApiError(
            status_code=503,
            code="ASSISTANT_RATE_LIMIT_BURST",
            message=(
                f"Su an istekler cok yogun (dakikalik hiz siniri){hint}. "
                "Birkac saniye bekleyip ayni soruyu tekrar sorun; modeli degistirmenize gerek yok."
            ),
        )
    if status in (401, 403) or "invalid api key" in text or "authentication" in text or "unauthorized" in text:
        return ApiError(
            status_code=503,
            code="ASSISTANT_AUTH",
            message="Asistan API anahtari gecersiz ya da yetkisiz. Ayarlar'dan anahtari kontrol edin.",
        )
    if (
        "model_not_found" in text
        or "does not exist" in text
        or "decommission" in text
        or ("model" in text and "not found" in text)
    ):
        return ApiError(
            status_code=400,
            code="ASSISTANT_MODEL_INVALID",
            message=(
                f"'{model}' modeli gecersiz ya da artik kullanilamiyor. "
                "Ayarlar (disli) > Model'den gecerli bir model secin (orn. llama-3.1-8b-instant)."
            ),
        )
    if "context_length" in text or "maximum context" in text or "too many tokens" in text or "context window" in text:
        return ApiError(
            status_code=400,
            code="ASSISTANT_CONTEXT",
            message="Soru ya da konusma cok uzun. Sohbeti sadelestirip yeniden deneyin.",
        )
    if "timed out" in text or "timeout" in text:
        return ApiError(
            status_code=503,
            code="ASSISTANT_TIMEOUT",
            message="Model yaniti zamaninda gelmedi (yogunluk). Soruyu sadelestirip birkac saniye sonra tekrar deneyin.",
        )
    if _is_transient_tool_error(exc):
        return ApiError(
            status_code=502,
            code="ASSISTANT_TOOL_FAILED",
            message="Asistan istegi su an isleyemedi (gecici model hatasi). Soruyu biraz farkli yazip tekrar deneyin.",
        )
    return ApiError(
        status_code=502,
        code="ASSISTANT_LLM_ERROR",
        message="Asistana su an ulasilamadi. Lutfen birazdan tekrar deneyin.",
    )


def run_assistant(
    db: Session,
    history: list[dict[str, str]],
) -> dict[str, Any]:
    settings = get_settings()
    config = resolve_assistant_config(db)
    if not config.enabled:
        raise ApiError(status_code=503, code="ASSISTANT_DISABLED", message="Asistan devre disi.")

    direct = _try_direct_assistant_reply(db, history, config.model)
    if direct is not None:
        return direct

    if not config.api_key:
        raise ApiError(
            status_code=503,
            code="ASSISTANT_NO_KEY",
            message="Asistan API anahtari tanimli degil. Ayarlar'dan ekleyin.",
        )

    try:
        from openai import OpenAI
    except ImportError:
        raise ApiError(
            status_code=503,
            code="ASSISTANT_DEP_MISSING",
            message="openai paketi kurulu degil (pip install openai).",
        )

    # max_retries=0: SDK 429'da Groq'un Retry-After'ina (60sn'ye kadar) uyup sessizce
    # uyumasin; hatayi hemen biz yakalayip temiz mesaj verelim (3-4 dk hang'in kok nedeni).
    # timeout: tek bir tamamlama 45sn'de donmezse hizlica basarisiz say, 10dk bekleme.
    client = OpenAI(
        api_key=config.api_key,
        base_url=config.base_url,
        timeout=45.0,
        max_retries=0,
    )

    # Anahtar-kelime tutmadi: tek hizli LLM cagrisiyla niyeti coz, sonra deterministik calistir.
    route, route_tokens = _route_with_llm(client, config, settings, history)
    if route is not None:
        routed = _dispatch_llm_route(db, config.model, route)
        if routed is not None:
            routed["usage"] = _record_usage(db, config.model, route_tokens)
            return routed

    trimmed = _prepare_prompt_history(history, settings.assistant_history_limit)
    messages: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt()}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in trimmed)

    used_tools: list[str] = []
    used_tokens = route_tokens
    # Ayni (arac + arg) tek konusma turunda tekrar cagrilirsa onbellekten doner.
    tool_cache: dict[str, str] = {}
    for iteration in range(max(1, settings.assistant_max_iterations)):
        try:
            response = _create_completion(client, config, settings, messages)
        except Exception as exc:
            if recover_from_failed_tool_call(db, exc, messages, used_tools, tool_cache):
                logger.warning(
                    "assistant_iteration_recovered",
                    extra={"iter": iteration, "model": config.model},
                )
                continue
            raise _map_llm_error(config.model, exc)

        usage_obj = getattr(response, "usage", None)
        used_tokens += int(getattr(usage_obj, "total_tokens", 0) or 0)

        message = response.choices[0].message
        tool_calls = message.tool_calls or []

        if not tool_calls:
            reply = (message.content or "").strip()
            if not reply:
                reply = "Bu soruya su an net bir yanit uretemedim. Soruyu biraz daha acik yazar misin?"
            return {
                "reply": reply,
                "tool_calls": used_tools,
                "usage": _record_usage(db, config.model, used_tokens),
            }

        messages.append(
            {
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            used_tools.append(tc.function.name)
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            content = dispatch_tool_cached(db, tc.function.name, args, tool_cache)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": content})

    logger.warning(
        "assistant_iterations_exhausted",
        extra={"model": config.model, "tools": used_tools},
    )
    return {
        "reply": "Soruyu yanitlamak icin gereken adim sayisi asildi. Lutfen soruyu sadelestir.",
        "tool_calls": used_tools,
        "usage": _record_usage(db, config.model, used_tokens),
    }


_EMPTY_REPLY = "Bu soruya su an net bir yanit uretemedim. Soruyu biraz daha acik yazar misin?"
_EXHAUSTED_REPLY = "Soruyu yanitlamak icin gereken adim sayisi asildi. Lutfen soruyu sadelestir."


def run_assistant_stream(db: Session, history: list[dict[str, str]]) -> Iterator[dict[str, Any]]:
    """run_assistant'in akan (streaming) surumu. Olay sozlukleri uretir:
    {"type":"status","tool":<ad>} arac calisirken; {"type":"delta","text":<parca>} cevap
    token'lari; {"type":"done","reply","tool_calls","usage"} bitiste; {"type":"error","message"}.
    Arac iterasyonlari kullaniciya 'status' olarak gorunur; nihai cevap canli akar."""
    settings = get_settings()
    config = resolve_assistant_config(db)
    if not config.enabled:
        yield {"type": "error", "message": "Asistan devre disi."}
        return

    direct = _try_direct_assistant_reply(db, history, config.model)
    if direct is not None:
        yield {
            "type": "done",
            "reply": direct["reply"],
            "tool_calls": direct["tool_calls"],
            "usage": direct["usage"],
        }
        return
    if not config.api_key:
        yield {"type": "error", "message": "Asistan API anahtari tanimli degil. Ayarlar'dan ekleyin."}
        return
    try:
        from openai import OpenAI
    except ImportError:
        yield {"type": "error", "message": "Asistan bagimliligi eksik (openai)."}
        return

    client = OpenAI(api_key=config.api_key, base_url=config.base_url, timeout=45.0, max_retries=0)

    # Anahtar-kelime tutmadi: tek hizli LLM cagrisiyla niyeti coz, sonra deterministik calistir.
    yield {"type": "status", "tool": "anlama"}
    route, route_tokens = _route_with_llm(client, config, settings, history)
    if route is not None:
        routed = _dispatch_llm_route(db, config.model, route)
        if routed is not None:
            yield {
                "type": "done",
                "reply": routed["reply"],
                "tool_calls": routed["tool_calls"],
                "usage": _record_usage(db, config.model, route_tokens),
            }
            return

    trimmed = _prepare_prompt_history(history, settings.assistant_history_limit)
    messages: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt()}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in trimmed)

    used_tools: list[str] = []
    used_tokens = route_tokens
    tool_cache: dict[str, str] = {}

    for _iteration in range(max(1, settings.assistant_max_iterations)):
        content_parts: list[str] = []
        tool_calls_acc: dict[int, dict[str, str]] = {}
        saw_tool = False
        streamed_content = False
        try:
            stream = _invoke_with_llm_retries(
                lambda: client.chat.completions.create(
                    model=config.model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    temperature=settings.assistant_temperature,
                    stream=True,
                    stream_options={"include_usage": True},
                ),
                model=config.model,
            )
            for chunk in stream:
                usage_obj = getattr(chunk, "usage", None)
                if usage_obj is not None:
                    used_tokens += int(getattr(usage_obj, "total_tokens", 0) or 0)
                choices = chunk.choices
                if not choices:
                    continue
                delta = choices[0].delta
                if delta is None:
                    continue
                if delta.tool_calls:
                    saw_tool = True
                    for tcd in delta.tool_calls:
                        slot = tool_calls_acc.setdefault(tcd.index, {"id": "", "name": "", "args": ""})
                        if tcd.id:
                            slot["id"] = tcd.id
                        if tcd.function is not None:
                            if tcd.function.name:
                                slot["name"] = tcd.function.name
                            if tcd.function.arguments:
                                slot["args"] += tcd.function.arguments
                if delta.content:
                    content_parts.append(delta.content)
                    # Arac cagrisi gorulmediyse nihai cevap kabul edip canli akit.
                    if not saw_tool:
                        streamed_content = True
                        yield {"type": "delta", "text": delta.content}
        except Exception as exc:
            pre_len = len(used_tools)
            if recover_from_failed_tool_call(db, exc, messages, used_tools, tool_cache):
                for tool_name in used_tools[pre_len:]:
                    yield {"type": "status", "tool": tool_name}
                continue
            err = _map_llm_error(config.model, exc)
            yield {"type": "error", "message": err.message}
            return

        if tool_calls_acc:
            # Bu tur arac cagrisiymis: canli akmis on-metni istemcide temizle (nihai cevap degildi).
            if streamed_content:
                yield {"type": "reset"}
            ordered = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]
            assistant_tool_calls: list[dict[str, Any]] = []
            tool_result_msgs: list[dict[str, Any]] = []
            for i, tc in enumerate(ordered):
                cid = tc["id"] or f"call_{i}"
                name = tc["name"]
                used_tools.append(name)
                assistant_tool_calls.append(
                    {
                        "id": cid,
                        "type": "function",
                        "function": {"name": name, "arguments": tc["args"] or "{}"},
                    }
                )
                yield {"type": "status", "tool": name}
                try:
                    args = json.loads(tc["args"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                content = dispatch_tool_cached(db, name, args, tool_cache)
                tool_result_msgs.append({"role": "tool", "tool_call_id": cid, "content": content})
            messages.append(
                {"role": "assistant", "content": "".join(content_parts), "tool_calls": assistant_tool_calls}
            )
            messages.extend(tool_result_msgs)
            continue

        reply = "".join(content_parts).strip() or _EMPTY_REPLY
        # _EMPTY_REPLY canli akmadi; istemci done.reply'i basar (delta gelmediyse).
        yield {
            "type": "done",
            "reply": reply,
            "tool_calls": used_tools,
            "usage": _record_usage(db, config.model, used_tokens),
        }
        return

    logger.warning("assistant_stream_iterations_exhausted", extra={"model": config.model, "tools": used_tools})
    yield {
        "type": "done",
        "reply": _EXHAUSTED_REPLY,
        "tool_calls": used_tools,
        "usage": _record_usage(db, config.model, used_tokens),
    }
