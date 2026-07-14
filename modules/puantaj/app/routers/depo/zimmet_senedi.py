"""Zimmet senedi: bugun yeni zimmetlenen urunler icin yazdirilip imzalanabilir PDF tutanak.

Yeni ozellik (depojin entegrasyonunun mevcut toplu-zimmet akisindan bagimsiz). ``DepoSeri``
sadece GUNCEL zimmet durumunu tutar (bir seri icin tek ``zimmet_kullanici_id``/``zimmet_zaman``,
tarihce tablosu yok); bu yuzden "bugun yeni atananlar" = ``zimmet_kullanici_id`` dolu VE
``zimmet_zaman``'in Europe/Istanbul yerel tarihi istenen tarihe esit olan satirlar. Zaman
diliminin yerel gun sinirlarina cevrilmesi ``app/services/attendance.py``'deki
``_attendance_timezone``/``_local_day_bounds_utc`` deseniyle aynidir; tek fark, bu depo
modulunde tum zaman damgalari ``app/services/depo_utils.utc_now()`` konvansiyonuyla NAIVE UTC
olarak saklandigi icin (attendance tarafinin aksine, orada aware UTC donuyor) burada da
sinirlari naive UTC'ye cevirip filtreliyoruz -- boylece hem Postgres'te hem sqlite testlerinde
DepoSeri.zimmet_zaman ile ayni turde (naive) karsilastirma yapilir.
"""

from __future__ import annotations

import io
import os
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import reportlab
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import DepoDepo, DepoSayimStok, DepoSeri, DepoUser, Employee
from app.services.depo_auth import current_depo_user
from app.services.depo_excel_style import ACCENT, ACCENT_BG, DEEP
from app.settings import get_settings

router = APIRouter(prefix="/zimmet-senedi", tags=["depo-zimmet-senedi"])

_VARSAYILAN_TZ = "Europe/Istanbul"
_SIRKET_UNVANI = "RAINWATER DIŞ TİCARET SANAYİ VE TİCARET A.Ş."
_TAAHHUT_METNI = (
    "Yukarıda cinsi, markası/modeli, seri numarası ve adedi belirtilen demirbaş/malzeme(ler) "
    "tarafıma eksiksiz, çalışır ve hasarsız vaziyette teslim edilmiştir. İşbu malzeme(ler)i "
    "özenle ve yalnızca iş amaçları doğrultusunda kullanacağımı; şirket yetkilisince talep "
    "edilmesi veya iş sözleşmemin herhangi bir nedenle sona ermesi halinde aynı nitelikte, "
    "eksiksiz ve çalışır durumda iade edeceğimi; kaybolması, hasar görmesi veya kullanılamaz "
    "hale gelmesi durumunda 4857 sayılı İş Kanunu ve ilgili mevzuat hükümleri çerçevesinde "
    "doğacak sorumluluğu kabul ettiğimi beyan ve taahhüt ederim."
)

# reportlab kendi Vera.ttf/VeraBd.ttf fontlarini pip paketiyle birlikte getirir; Turkce
# karakterleri (ş,Ş,ğ,Ğ,ı,İ,ö,Ö,ü,Ü,ç,Ç) kapsar, repo'ya ayrica font eklemeye gerek yok.
_FONTS_DIR = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
pdfmetrics.registerFont(TTFont("Vera", os.path.join(_FONTS_DIR, "Vera.ttf")))
pdfmetrics.registerFont(TTFont("VeraBd", os.path.join(_FONTS_DIR, "VeraBd.ttf")))
pdfmetrics.registerFontFamily("Vera", normal="Vera", bold="VeraBd", italic="Vera", boldItalic="VeraBd")


def _hexcolor(argb: str) -> colors.Color:
    """depo_excel_style'daki ARGB hex sabitlerini (ornek: 'FF0F2A44') reportlab rengine cevirir."""
    return colors.HexColor(f"#{argb[-6:]}")


def _tz() -> ZoneInfo:
    raw_name = (get_settings().attendance_timezone or "").strip() or _VARSAYILAN_TZ
    try:
        return ZoneInfo(raw_name)
    except Exception:
        return ZoneInfo(_VARSAYILAN_TZ)


def _parse_tarih(tarih: str | None) -> date:
    if not tarih:
        return datetime.now(timezone.utc).astimezone(_tz()).date()
    try:
        return date.fromisoformat(tarih)
    except ValueError:
        raise ApiError(status_code=400, code="INVALID_DATE", message="tarih formati YYYY-MM-DD olmalidir.")


def _local_day_bounds_utc_naive(gun: date) -> tuple[datetime, datetime]:
    """Verilen yerel (Europe/Istanbul) takvim gununun UTC sinirlarini NAIVE datetime olarak dondurur.

    DepoSeri.zimmet_zaman degerleri depo_utils.utc_now() ile naive UTC olarak yaziliyor; bu
    fonksiyon da ayni turde (naive) deger dondurerek dogrudan karsilastirilabilir olmasini saglar.
    """
    tz = _tz()
    start_local = datetime.combine(gun, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _format_saat(dt: datetime | None, tz: ZoneInfo) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).strftime("%H:%M")


@router.get("/bugun")
def zimmet_senedi_bugun(
    tarih: str | None = Query(None),
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
):
    gun = _parse_tarih(tarih)
    start_utc, end_utc = _local_day_bounds_utc_naive(gun)

    employee_rows = db.execute(
        select(DepoSeri.zimmet_employee_id, func.count(DepoSeri.id))
        .where(
            DepoSeri.zimmet_employee_id.isnot(None),
            DepoSeri.zimmet_zaman >= start_utc,
            DepoSeri.zimmet_zaman < end_utc,
        )
        .group_by(DepoSeri.zimmet_employee_id)
    ).all()
    rows = db.execute(
        select(DepoSeri.zimmet_kullanici_id, func.count(DepoSeri.id))
        .where(
            DepoSeri.zimmet_employee_id.is_(None),
            DepoSeri.zimmet_kullanici_id.isnot(None),
            DepoSeri.zimmet_zaman >= start_utc,
            DepoSeri.zimmet_zaman < end_utc,
        )
        .group_by(DepoSeri.zimmet_kullanici_id)
    ).all()

    if not rows and not employee_rows:
        return {"tarih": gun.isoformat(), "calisanlar": []}

    user_ids = [r[0] for r in rows]
    users = {u.id: u for u in db.execute(select(DepoUser).where(DepoUser.id.in_(user_ids))).scalars()}
    emp_ids = [u.employee_id for u in users.values() if u.employee_id]
    emp_map = {}
    if emp_ids:
        emp_map = {e.id: e for e in db.execute(select(Employee).where(Employee.id.in_(emp_ids))).scalars()}

    calisanlar = []
    direct_emp_ids = [r[0] for r in employee_rows]
    direct_emp_map = {
        e.id: e for e in db.execute(select(Employee).where(Employee.id.in_(direct_emp_ids))).scalars()
    } if direct_emp_ids else {}
    for employee_id, sayi in employee_rows:
        employee = direct_emp_map.get(employee_id)
        if employee:
            calisanlar.append({
                "depo_user_id": None,
                "employee_id": employee.id,
                "ad": employee.full_name,
                "urun_sayisi": int(sayi),
            })
    for uid, sayi in rows:
        u = users.get(uid)
        if not u:
            continue
        emp = emp_map.get(u.employee_id) if u.employee_id else None
        ad = emp.full_name if emp else u.ad
        calisanlar.append({
            "depo_user_id": uid,
            "employee_id": u.employee_id,
            "ad": ad,
            "urun_sayisi": int(sayi),
        })
    calisanlar.sort(key=lambda x: x["ad"])
    return {"tarih": gun.isoformat(), "calisanlar": calisanlar}


class ZimmetSenediPdfIn(BaseModel):
    depo_user_ids: list[int] = Field(default_factory=list)
    employee_ids: list[int] = Field(default_factory=list)
    tarih: str | None = None


@router.post("/pdf")
def zimmet_senedi_pdf(
    data: ZimmetSenediPdfIn,
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
):
    gun = _parse_tarih(data.tarih)
    start_utc, end_utc = _local_day_bounds_utc_naive(gun)
    tz = _tz()

    sayfalar: list[tuple[DepoUser | None, Employee | None, list]] = []
    for employee_id in data.employee_ids:
        emp = db.get(Employee, employee_id)
        if not emp:
            continue
        rows = db.execute(
            select(DepoSeri, DepoSayimStok, DepoDepo)
            .join(DepoSayimStok, DepoSayimStok.id == DepoSeri.stok_id)
            .outerjoin(DepoDepo, DepoDepo.id == DepoSeri.depo_id)
            .where(
                DepoSeri.zimmet_employee_id == employee_id,
                DepoSeri.zimmet_zaman >= start_utc,
                DepoSeri.zimmet_zaman < end_utc,
            )
            .order_by(DepoSeri.zimmet_zaman.asc())
        ).all()
        if rows:
            sayfalar.append((None, emp, rows))
    for uid in data.depo_user_ids:
        user = db.get(DepoUser, uid)
        if not user:
            continue
        rows = db.execute(
            select(DepoSeri, DepoSayimStok, DepoDepo)
            .join(DepoSayimStok, DepoSayimStok.id == DepoSeri.stok_id)
            .outerjoin(DepoDepo, DepoDepo.id == DepoSeri.depo_id)
            .where(
                DepoSeri.zimmet_kullanici_id == uid,
                DepoSeri.zimmet_employee_id.is_(None),
                DepoSeri.zimmet_zaman >= start_utc,
                DepoSeri.zimmet_zaman < end_utc,
            )
            .order_by(DepoSeri.zimmet_zaman.asc())
        ).all()
        if not rows:
            continue
        emp = db.get(Employee, user.employee_id) if user.employee_id else None
        sayfalar.append((user, emp, rows))

    if not sayfalar:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Secilen calisanlar icin bu tarihte zimmet kaydi yok.",
        )

    pdf_bytes = _zimmet_senedi_pdf_olustur(gun, tz, sayfalar)
    fname = f"zimmet_senedi_{gun.isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/bos-form")
def zimmet_senedi_bos_form(_: DepoUser = Depends(current_depo_user)):
    """Elle doldurulacak, bos (veri icermeyen) zimmet senedi sablonu -- yazdirip
    kalemle doldurmak icin. Tarihe/calisana bagli degildir, her cagrida ayni belge."""
    pdf_bytes = _zimmet_senedi_bos_form_pdf_olustur()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="zimmet_senedi_bos_form.pdf"'},
    )


def _zimmet_senedi_pdf_olustur(
    gun: date,
    tz: ZoneInfo,
    sayfalar: list[tuple[DepoUser | None, Employee | None, list]],
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title="Zimmet Senedi",
    )
    tarih_str = gun.strftime("%d.%m.%Y")

    sirket_style = ParagraphStyle("zs_sirket", fontName="VeraBd", fontSize=12, leading=15, textColor=_hexcolor(DEEP), alignment=1, spaceAfter=2)
    baslik_style = ParagraphStyle("zs_baslik", fontName="VeraBd", fontSize=15, leading=19, textColor=colors.HexColor("#222222"), alignment=1, spaceBefore=6, spaceAfter=4)
    senetno_style = ParagraphStyle("zs_senetno", fontName="Vera", fontSize=9, leading=12, textColor=colors.HexColor("#666666"), alignment=1, spaceAfter=14)
    ad_style = ParagraphStyle("zs_ad", fontName="VeraBd", fontSize=12.5, leading=16, textColor=_hexcolor(DEEP), spaceBefore=4, spaceAfter=2)
    bilgi_style = ParagraphStyle("zs_bilgi", fontName="Vera", fontSize=10.5, leading=14, textColor=colors.HexColor("#444444"), spaceAfter=12)
    toplam_style = ParagraphStyle("zs_toplam", fontName="VeraBd", fontSize=11, leading=14, textColor=_hexcolor(DEEP), spaceBefore=6, spaceAfter=14)
    taahhut_baslik_style = ParagraphStyle("zs_taahhut_b", fontName="VeraBd", fontSize=10, leading=13, textColor=colors.HexColor("#222222"), spaceAfter=4)
    taahhut_style = ParagraphStyle("zs_taahhut", fontName="Vera", fontSize=9.5, leading=14.5, textColor=colors.HexColor("#222222"), alignment=4, spaceAfter=16)
    imza_baslik_style = ParagraphStyle("zs_imza_b", fontName="VeraBd", fontSize=10, leading=13, textColor=colors.HexColor("#222222"))
    imza_alt_style = ParagraphStyle("zs_imza_a", fontName="Vera", fontSize=9, leading=12, textColor=colors.HexColor("#666666"))
    kapanis_style = ParagraphStyle("zs_kapanis", fontName="Vera", fontSize=8.5, leading=11, textColor=colors.HexColor("#777777"), spaceBefore=10)

    story: list = []
    son_index = len(sayfalar) - 1

    for i, (user, emp, rows) in enumerate(sayfalar):
        senet_no = f"ZS-{gun.strftime('%Y%m%d')}-{i + 1:03d}"

        story.append(Paragraph(_SIRKET_UNVANI, sirket_style))
        story.append(HRFlowable(width="100%", thickness=1, color=_hexcolor(DEEP), spaceAfter=6))
        story.append(Paragraph("DEPODAN ÜRÜN TESLİM ZİMMET SENEDİ", baslik_style))
        story.append(Paragraph(f"Senet No: {senet_no}&nbsp;&nbsp;·&nbsp;&nbsp;Tarih: {tarih_str}", senetno_style))

        ad = emp.full_name if emp else (user.ad if user else "Calisan")
        story.append(Paragraph(f"Teslim Alan: {ad}", ad_style))
        if emp is not None:
            parcalar = []
            departman = getattr(emp, "department", None)
            bolge = getattr(emp, "region", None)
            if departman is not None and getattr(departman, "name", None):
                parcalar.append(f"Departman: {departman.name}")
            if bolge is not None and getattr(bolge, "name", None):
                parcalar.append(f"Bölge: {bolge.name}")
            story.append(Paragraph("&nbsp;&nbsp;·&nbsp;&nbsp;".join(parcalar) if parcalar else "&nbsp;", bilgi_style))
        else:
            user_ad = user.ad if user else "-"
            user_rol = user.rol if user else "-"
            story.append(Paragraph(f"Depo Kullanıcısı: {user_ad} (Rol: {user_rol})", bilgi_style))

        tablo_veri = [["Sıra", "Stok Kodu", "Ürün Adı", "Seri No", "Depo", "Zimmet Saati"]]
        for sira, (seri, stok, depo) in enumerate(rows, start=1):
            tablo_veri.append([
                str(sira),
                stok.stok_kodu,
                stok.urun_adi,
                seri.seri_no,
                depo.ad if depo is not None else "-",
                _format_saat(seri.zimmet_zaman, tz),
            ])

        tablo = Table(
            tablo_veri,
            colWidths=[1.3 * cm, 2.7 * cm, 6.0 * cm, 3.3 * cm, 2.7 * cm, 2.6 * cm],
            repeatRows=1,
        )
        tablo.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "VeraBd"),
            ("FONTNAME", (0, 1), (-1, -1), "Vera"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), _hexcolor(DEEP)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (5, 0), (5, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C6BDAC")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _hexcolor(ACCENT_BG)]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tablo)
        story.append(Paragraph(f"Toplam: {len(rows)} kalem", toplam_style))

        story.append(Paragraph("TESLİM ALANIN BEYAN VE TAAHHÜDÜ", taahhut_baslik_style))
        story.append(Paragraph(_TAAHHUT_METNI, taahhut_style))

        imza_tablo = Table(
            [
                [
                    Paragraph("Teslim Eden (Depo Sorumlusu)", imza_baslik_style),
                    Paragraph("Teslim Alan (Çalışan)", imza_baslik_style),
                ],
                ["", ""],
                [
                    Paragraph("Ad Soyad / Tarih:", imza_alt_style),
                    Paragraph("Ad Soyad / Tarih:", imza_alt_style),
                ],
            ],
            colWidths=[8.5 * cm, 8.5 * cm],
            rowHeights=[0.6 * cm, 1.4 * cm, 0.5 * cm],
        )
        imza_tablo.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LINEBELOW", (0, 1), (0, 1), 1, _hexcolor(DEEP)),
            ("LINEBELOW", (1, 1), (1, 1), 1, _hexcolor(DEEP)),
        ]))
        story.append(imza_tablo)
        story.append(Paragraph(
            "İşbu senet, taraflarca okunup anlaşılarak 1 (bir) nüsha olarak düzenlenmiş ve imza altına alınmıştır.",
            kapanis_style,
        ))

        if i < son_index:
            story.append(PageBreak())

    doc.build(story)
    return buf.getvalue()


def _zimmet_senedi_bos_form_pdf_olustur() -> bytes:
    """Veriye bagli olmayan, elle doldurulacak bos zimmet senedi sablonu.

    Kurumsal ic form/dokuman kontrolu konvansiyonuna (dokuman no, yayin/revizyon
    tarihi, sayfa bilgisi) uygun sabit bir sablon uretir; her cagrida ayni bytes
    dondugu icin app static olarak da onbelleklenebilir.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.3 * cm,
        bottomMargin=1.5 * cm,
        title="Zimmet Senedi - Bos Form",
    )

    sirket_style = ParagraphStyle("bf_sirket", fontName="VeraBd", fontSize=11.5, leading=14, textColor=_hexcolor(DEEP))
    baslik_style = ParagraphStyle("bf_baslik", fontName="VeraBd", fontSize=15, leading=19, textColor=colors.HexColor("#222222"), alignment=1, spaceBefore=10, spaceAfter=2)
    alt_baslik_style = ParagraphStyle("bf_alt", fontName="Vera", fontSize=8.5, leading=11, textColor=colors.HexColor("#888888"), alignment=1, spaceAfter=10)
    kutu_deger_style = ParagraphStyle("bf_kutu_d", fontName="VeraBd", fontSize=8.5, leading=11, textColor=colors.HexColor("#222222"))
    alan_etiket_style = ParagraphStyle("bf_alan_e", fontName="VeraBd", fontSize=9, leading=12, textColor=colors.HexColor("#333333"))
    bolum_baslik_style = ParagraphStyle("bf_bolum", fontName="VeraBd", fontSize=10, leading=13, textColor=_hexcolor(DEEP), spaceBefore=8, spaceAfter=5)
    taahhut_style = ParagraphStyle("bf_taahhut", fontName="Vera", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#222222"), alignment=4, spaceAfter=8)
    imza_baslik_style = ParagraphStyle("bf_imza_b", fontName="VeraBd", fontSize=9.5, leading=12, textColor=colors.HexColor("#222222"))
    imza_alt_style = ParagraphStyle("bf_imza_a", fontName="Vera", fontSize=8.5, leading=11, textColor=colors.HexColor("#666666"))
    footer_style = ParagraphStyle("bf_footer", fontName="Vera", fontSize=7.5, leading=10, textColor=colors.HexColor("#999999"), spaceBefore=8)

    story: list = []

    story.append(Paragraph(_SIRKET_UNVANI, sirket_style))
    story.append(HRFlowable(width="100%", thickness=1.3, color=_hexcolor(DEEP), spaceBefore=6, spaceAfter=0))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#C9C9C9"), spaceBefore=1.5, spaceAfter=0))

    story.append(Paragraph("DEPODAN ÜRÜN TESLİM ZİMMET SENEDİ", baslik_style))
    story.append(Paragraph("BOŞ FORM — EL İLE DOLDURULACAKTIR", alt_baslik_style))

    # --- Taraf/kimlik bilgi alanlari: etiket + alt cizgili bos hane ---
    def _alan(etiket: str) -> list:
        return [
            Paragraph(etiket, alan_etiket_style),
            Paragraph("&nbsp;", kutu_deger_style),
        ]

    alan_satirlari = [
        ("Depo / Şube", "Senet No"),
        ("Teslim Tarihi", "Teslim Saati"),
        ("Teslim Alan Adı Soyadı", "T.C. Kimlik No"),
        ("Departman / Görev", "Sicil No"),
    ]
    bilgi_veri = []
    for sol, sag in alan_satirlari:
        bilgi_veri.append([*_alan(sol), *_alan(sag)])
    bilgi_tablo = Table(
        bilgi_veri,
        colWidths=[3.4 * cm, 5.7 * cm, 3.4 * cm, 5.7 * cm],
        rowHeights=[0.92 * cm] * len(bilgi_veri),
    )
    bilgi_tablo.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (1, 0), (1, -1), 0.6, colors.HexColor("#999999")),
        ("LINEBELOW", (3, 0), (3, -1), 0.6, colors.HexColor("#999999")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(bilgi_tablo)

    # --- Bos, el ile doldurulacak urun tablosu ---
    story.append(Paragraph("TESLİM EDİLEN ÜRÜN / DEMİRBAŞ LİSTESİ", bolum_baslik_style))
    KALEM_SATIR_SAYISI = 9
    tablo_veri = [["Sıra", "Stok / Demirbaş Kodu", "Ürün / Malzeme Adı", "Seri No", "Miktar", "Açıklama"]]
    for sira in range(1, KALEM_SATIR_SAYISI + 1):
        tablo_veri.append([str(sira), "", "", "", "", ""])
    tablo = Table(
        tablo_veri,
        colWidths=[1.1 * cm, 3.3 * cm, 5.7 * cm, 3.3 * cm, 1.8 * cm, 3.2 * cm],
        rowHeights=[0.7 * cm] + [0.85 * cm] * KALEM_SATIR_SAYISI,
        repeatRows=1,
    )
    tablo.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "VeraBd"),
        ("FONTNAME", (0, 1), (-1, -1), "Vera"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), _hexcolor(DEEP)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (4, 0), (4, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C6BDAC")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(tablo)
    story.append(Paragraph("Toplam Kalem: ______________", ParagraphStyle(
        "bf_toplam", fontName="VeraBd", fontSize=10, leading=14, textColor=_hexcolor(DEEP), spaceBefore=6, spaceAfter=4,
    )))

    story.append(Paragraph("TESLİM ALANIN BEYAN VE TAAHHÜDÜ", bolum_baslik_style))
    story.append(Paragraph(_TAAHHUT_METNI, taahhut_style))

    imza_tablo = Table(
        [
            [
                Paragraph("Teslim Eden<br/>(Depo Sorumlusu)", imza_baslik_style),
                Paragraph("Teslim Alan<br/>(Çalışan)", imza_baslik_style),
                Paragraph("Onaylayan<br/>(Yetkili)", imza_baslik_style),
            ],
            ["", "", ""],
            [
                Paragraph("Ad Soyad / Tarih:", imza_alt_style),
                Paragraph("Ad Soyad / Tarih:", imza_alt_style),
                Paragraph("Ad Soyad / Tarih:", imza_alt_style),
            ],
        ],
        colWidths=[5.87 * cm, 5.87 * cm, 5.86 * cm],
        rowHeights=[0.9 * cm, 1.5 * cm, 0.5 * cm],
    )
    imza_tablo.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LINEBELOW", (0, 1), (0, 1), 1, _hexcolor(DEEP)),
        ("LINEBELOW", (1, 1), (1, 1), 1, _hexcolor(DEEP)),
        ("LINEBELOW", (2, 1), (2, 1), 1, _hexcolor(DEEP)),
    ]))

    # Imza tablosu + kapanis metni sayfa sinirinda bolunmesin diye tek blok halinde tutuluyor.
    story.append(KeepTogether([
        imza_tablo,
        HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#C9C9C9"), spaceBefore=16, spaceAfter=4),
        Paragraph(
            f"Bu form {_SIRKET_UNVANI} Depo Yönetimi'ne aittir; izinsiz çoğaltılamaz ve üçüncü "
            "kişilerle paylaşılamaz. Doldurulan nüsha, ilgili depo dosyasında muhafaza edilir.",
            footer_style,
        ),
    ]))

    doc.build(story)
    return buf.getvalue()
