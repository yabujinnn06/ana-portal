import type {
  CompanySettingsRecord,
  EmployeePayrollProfileRecord,
  MonthlyEmployeeDay,
  MonthlyEmployeeResponse,
  PayrollItemRecord,
} from '../types/api'

const MONTHS = [
  'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
  'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK',
]

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function money(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hours(minutes: number): string {
  const safe = Math.max(0, Math.round((minutes / 60) * 100) / 100)
  return safe.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Puantaj cetveli gun kodu: N calisti, T hafta/resmi tatil, D ozel gun,
// Z ucretsiz izin, Y yillik izin, R raporlu, Ü ucretli izin, M mazeretsiz, - bos.
function dayCode(day: MonthlyEmployeeDay): string {
  if (day.leave_type === 'UNPAID') return 'Z'
  if (day.leave_type === 'ANNUAL') return 'Y'
  if (day.leave_type === 'SICK') return 'R'
  if (day.leave_type) return 'Ü'
  if (day.day_type === 'SPECIAL_DAY' || day.day_type === 'SPECIAL_HALF_DAY') return 'D'
  if (day.day_type === 'SUNDAY' || day.day_type === 'WEEKLY_REST') return 'T'
  if (day.status === 'OK') return 'N'
  if (day.status === 'INCOMPLETE') return 'M'
  if (day.status === 'OFF') return 'T'
  return '-'
}

export function buildBordroHtml(args: {
  item: PayrollItemRecord
  company: CompanySettingsRecord | null
  profile: EmployeePayrollProfileRecord | null
  monthly: MonthlyEmployeeResponse | null
  year: number
  month: number
}): string {
  const { item, company, profile, monthly, year, month } = args
  const period = `${MONTHS[month - 1]} / ${year}`
  const c = company ?? ({} as CompanySettingsRecord)
  const p = profile ?? ({} as EmployeePayrollProfileRecord)

  const days: MonthlyEmployeeDay[] = monthly?.days ?? []
  const byDay = new Map<number, MonthlyEmployeeDay>()
  for (const d of days) {
    byDay.set(new Date(d.date).getDate(), d)
  }
  const daysInMonth = new Date(year, month, 0).getDate()
  const gridHeader = Array.from({ length: daysInMonth }, (_, i) =>
    `<th>${i + 1}</th>`,
  ).join('')
  const gridRow = Array.from({ length: daysInMonth }, (_, i) => {
    const d = byDay.get(i + 1)
    return `<td>${d ? dayCode(d) : '-'}</td>`
  }).join('')

  const normalDays = days.filter((d) => d.status === 'OK').length
  const restDays = days.filter((d) => d.day_type === 'SUNDAY' || d.day_type === 'WEEKLY_REST').length
  const specialDays = days.filter((d) => d.day_type === 'SPECIAL_DAY' || d.day_type === 'SPECIAL_HALF_DAY').length
  const unpaidDays = days.filter((d) => d.leave_type === 'UNPAID').length
  const annualDays = days.filter((d) => d.leave_type === 'ANNUAL').length

  const odemeler = Number(item.gross_total) + Number(item.additional_earnings)
  const kesintiler =
    Number(item.sgk_employee) +
    Number(item.unemployment_employee) +
    Number(item.income_tax_payable) +
    Number(item.stamp_tax_payable) +
    Number(item.additional_deductions)

  const row = (label: string, value: string) =>
    `<tr><td>${esc(label)}</td><td class="num">${value}</td></tr>`

  const earnings = (item.components ?? []).filter((c) => c.kind === 'EARNING')
  const deductions = (item.components ?? []).filter((c) => c.kind === 'DEDUCTION')
  const exemptTag = (c: { sgk_exempt: boolean; income_tax_exempt: boolean; stamp_tax_exempt: boolean }) => {
    const tags = [c.sgk_exempt ? 'SGK' : null, c.income_tax_exempt ? 'GV' : null, c.stamp_tax_exempt ? 'Damga' : null].filter(Boolean)
    return tags.length ? ` <span style="color:#64748b">(${tags.join('/')} istisna)</span>` : ''
  }
  const componentsCard =
    earnings.length + deductions.length > 0
      ? `<div class="sec">Ek Ödeme ve Kesintiler</div>
<table class="bordro"><tbody>
  <tr><th>Tür</th><th>Açıklama</th><th>İstisna / Not</th><th class="num">Tutar</th></tr>
  ${earnings
    .map(
      (c) =>
        `<tr><td>Ek Ödeme</td><td>${esc(c.label)}</td><td>${exemptTag(c)}</td><td class="num">+${money(c.amount)}</td></tr>`,
    )
    .join('')}
  ${deductions
    .map(
      (c) => `<tr><td>Ek Kesinti</td><td>${esc(c.label)}</td><td>-</td><td class="num">-${money(c.amount)}</td></tr>`,
    )
    .join('')}
  <tr><td colspan="3"><b>Toplam Ek Ödeme / Kesinti</b></td><td class="num"><b>+${money(item.additional_earnings)} / -${money(item.additional_deductions)}</b></td></tr>
</tbody></table>`
      : ''

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" />
<title>Ücret Bordrosu - ${esc(item.employee_name)} - ${esc(period)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111827; font-size:11px; margin:0; }
  .title { text-align:center; font-weight:700; font-size:15px; color:#0c4353; margin:0 0 6px; }
  .firma { font-size:10px; line-height:1.45; margin:0 0 10px; }
  .firma b { color:#0c4353; }
  .sec { font-weight:700; color:#0c4353; text-transform:uppercase; letter-spacing:.04em; font-size:11px; margin:12px 0 4px; border-bottom:2px solid #0c4353; padding-bottom:2px; }
  table { width:100%; border-collapse:collapse; }
  .bordro td, .bordro th { border:1px solid #cbd5e1; padding:3px 5px; text-align:left; }
  .bordro th { background:#ecf3f5; font-size:9px; text-transform:uppercase; }
  .grid td, .grid th { border:1px solid #cbd5e1; padding:2px; text-align:center; width:22px; font-size:9px; }
  .grid th { background:#ecf3f5; }
  .legend { font-size:8.5px; color:#475569; margin:3px 0 0; }
  .cols { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:6px; }
  .card { border:1px solid #cbd5e1; }
  .card .h { background:#0c4353; color:#fff; font-weight:700; font-size:10px; padding:3px 6px; text-transform:uppercase; }
  .card table td { padding:2px 6px; border-bottom:1px solid #eef2f6; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .net { background:#ecfdf5; border:1px solid #6ee7b7; }
  .net .big { font-size:16px; font-weight:700; color:#047857; }
  .kv td:first-child { color:#64748b; }
</style></head><body>
<div class="title">ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI</div>
<div class="firma">
  <b>${esc(c.firma_unvan ?? '-')}</b> &nbsp; ${esc(period)}<br/>
  Merkez: ${esc(c.merkez_adres ?? '-')} &nbsp;|&nbsp; Şube: ${esc(c.sube_adres ?? '-')}<br/>
  Vergi D./No: ${esc(c.vergi_dairesi ?? '-')} / ${esc(c.vergi_no ?? '-')} &nbsp;|&nbsp;
  SGK İşyeri No: ${esc(c.sgk_isyeri_no ?? '-')} &nbsp;|&nbsp;
  Tic. Sicil: ${esc(c.ticaret_sicil_no ?? '-')} &nbsp;|&nbsp; Mersis: ${esc(c.mersis_no ?? '-')}
</div>

<div class="sec">Ücret Bordrosu</div>
<table class="bordro"><tbody>
  <tr>
    <th>Adı Soyadı</th><th>T.C. No</th><th>SGK Sicil</th><th>İşe Giriş</th>
    <th>SGK Statü</th><th>Çal. Gün</th><th>Brüt Ücret</th><th>Fazla Mesai</th>
    <th>Brüt Toplam</th><th>SGK Matrah</th><th>Gelir V. Matrah</th><th>Dev. Matrah</th>
  </tr>
  <tr>
    <td>${esc(item.employee_name)}</td>
    <td>${esc(p.tc_kimlik_no ?? '-')}</td>
    <td>${esc(p.sgk_sicil_no ?? '-')}</td>
    <td>${esc(p.ise_giris_tarihi ?? '-')}</td>
    <td>${item.sgk_status === 'EMEKLI' ? 'EMEKLİ' : 'NORMAL'}</td>
    <td class="num">${item.sgk_days}</td>
    <td class="num">${money(item.base_earning)}</td>
    <td class="num">${money(Number(item.overtime_fm1_amount) + Number(item.overtime_fm2_amount) + Number(item.overtime_fm3_amount))}</td>
    <td class="num">${money(item.gross_total)}</td>
    <td class="num">${money(item.sgk_base)}</td>
    <td class="num">${money(item.income_tax_base)}</td>
    <td class="num">${money(item.cumulative_income_tax_base)}</td>
  </tr>
  <tr>
    <th>SGK Kes.</th><th>İşsizlik Kes.</th><th>Gelir V.</th><th>GV İstisna</th>
    <th>Damga V.</th><th colspan="2">Net Ücret</th><th colspan="2">SGK İşv.</th>
    <th colspan="2">İşv. Maliyet</th><th>Kanun</th>
  </tr>
  <tr>
    <td class="num">${money(item.sgk_employee)}</td>
    <td class="num">${money(item.unemployment_employee)}</td>
    <td class="num">${money(item.income_tax_payable)}</td>
    <td class="num">${money(item.income_tax_exemption)}</td>
    <td class="num">${money(item.stamp_tax_payable)}</td>
    <td class="num" colspan="2"><b>${money(item.net_total)}</b></td>
    <td class="num" colspan="2">${money(item.sgk_employer)}</td>
    <td class="num" colspan="2">${money(item.employer_cost_total)}</td>
    <td>${esc(item.kanun_no ?? p.kanun_no ?? '-')}</td>
  </tr>
</tbody></table>

<div class="sec">Puantaj Cetveli — ${esc(period)}</div>
<table class="grid"><thead><tr><th>Gün</th>${gridHeader}</tr></thead>
<tbody><tr><td>${esc(item.employee_name)}</td>${gridRow}</tr></tbody></table>
<p class="legend">N=Çalıştı &nbsp; T=Hafta/Resmi Tatil &nbsp; D=Özel/Bayram &nbsp; Y=Yıllık İzin &nbsp; Ü=Ücretli İzin &nbsp; Z=Ücretsiz İzin &nbsp; R=Raporlu &nbsp; M=Mazeretsiz</p>

${componentsCard}

<div class="sec">Ücret Pusulası</div>
<div class="cols">
  <div class="card">
    <div class="h">Personel Bilgileri</div>
    <table class="kv"><tbody>
      ${row('Bordro Dönemi', esc(period))}
      ${row('Adı Soyadı', esc(item.employee_name))}
      ${row('Departman', esc(item.department_name ?? '-'))}
      ${row('Pozisyon / Ünvan', esc(p.pozisyon ?? '-'))}
      ${row('Meslek Grubu', esc(p.meslek_grubu ?? '-'))}
      ${row('Sözleşme Tipi', p.sozlesme_tipi === 'BELIRLI' ? 'Belirli Süreli' : p.sozlesme_tipi === 'BELIRSIZ' ? 'Belirsiz Süreli' : '-')}
      ${row('T.C. Kimlik No', esc(p.tc_kimlik_no ?? '-'))}
      ${row('SGK Sicil No', esc(p.sgk_sicil_no ?? '-'))}
      ${row('İşe Giriş Tarihi', esc(p.ise_giris_tarihi ?? '-'))}
      ${row('Cinsiyet', esc(p.cinsiyet ?? '-'))}
      ${row('SGK Statüsü', item.sgk_status === 'EMEKLI' ? 'Emekli (SGDP)' : 'Normal')}
      ${row('Banka / Şube', esc((p.banka_adi ?? '-') + ' / ' + (p.sube ?? '-')))}
      ${row('Hesap No', esc(p.hesap_no ?? '-'))}
      ${row('Çalışılan Gün (SGK)', String(item.sgk_days))}
      ${row('Saat Ücreti', money(item.hourly_rate))}
    </tbody></table>
  </div>
  <div class="card">
    <div class="h">Mesai / Gün Dağılımı</div>
    <table class="kv"><tbody>
      <tr><th>Açıklama</th><th class="num">Gün</th></tr>
      ${row('Normal Çalışma', String(normalDays))}
      ${row('Hafta/Resmi Tatil', String(restDays))}
      ${row('Özel/Bayram', String(specialDays))}
      ${row('Yıllık İzin', String(annualDays))}
      ${row('Ücretsiz İzin', String(unpaidDays))}
    </tbody></table>
    <div class="h">Fazla Mesai</div>
    <table class="kv"><tbody>
      <tr><th>Açıklama</th><th class="num">Saat</th><th class="num">Tutar</th></tr>
      <tr><td>Fazla Mesai (FM1)</td><td class="num">${hours(item.fm1_minutes)}</td><td class="num">${money(item.overtime_fm1_amount)}</td></tr>
      <tr><td>Bayram/Resmi (FM2)</td><td class="num">${hours(item.fm2_minutes)}</td><td class="num">${money(item.overtime_fm2_amount)}</td></tr>
      <tr><td>Hafta Tatili (FM3)</td><td class="num">${hours(item.fm3_minutes)}</td><td class="num">${money(item.overtime_fm3_amount)}</td></tr>
    </tbody></table>
  </div>
  <div class="card">
    <div class="h">SGK ve Vergiler</div>
    <table class="kv"><tbody>
      ${row('Sigorta Matrahı', money(item.sgk_base))}
      ${Number(item.disability_reduction) > 0 ? row('Engellilik İndirimi', money(item.disability_reduction)) : ''}
      ${row('Vergi Matrahı', money(item.income_tax_base))}
      ${row('Dev. Vergi Matrahı', money(item.cumulative_income_tax_base))}
      ${row('SGK Kesintisi' + (item.sgk_status === 'EMEKLI' ? ' (SGDP %7,5)' : ' (%14)'), money(item.sgk_employee))}
      ${row('İşsizlik Kesintisi', money(item.unemployment_employee))}
      ${row('Gelir Vergisi', money(item.income_tax_payable))}
      ${row('Gelir V. İstisnası', money(item.income_tax_exemption))}
      ${row('Damga Vergisi', money(item.stamp_tax_payable))}
    </tbody></table>
    <div class="card net" style="margin-top:6px">
      <div class="h" style="background:#047857">Net Ödenen</div>
      <table class="kv"><tbody>
        ${row('Ödemeler Toplamı', money(odemeler))}
        ${row('Kesintiler Toplamı', money(kesintiler))}
        <tr><td><b>NET ÜCRET</b></td><td class="num big">${money(item.net_total)}</td></tr>
      </tbody></table>
    </div>
  </div>
</div>
<p class="legend" style="margin-top:10px">${esc(period)} ayına ait bordrodur. Puantaj kayıtlarından otomatik üretilmiştir. İşveren toplam maliyeti: ${money(item.employer_cost_total)} TL.</p>
</body></html>`
}
