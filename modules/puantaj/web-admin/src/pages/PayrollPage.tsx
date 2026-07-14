import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  approvePayrollRun,
  createPayrollComponent,
  deletePayrollComponent,
  deletePayrollRun,
  downloadBankPaymentTxt,
  downloadBankPaymentXlsx,
  downloadLogoMahsupXlsx,
  downloadLogoPuantajXlsx,
  downloadPayrollRunXlsx,
  generatePayrollRun,
  getCompanySettings,
  getEmployeePayrollProfile,
  getEmployees,
  getMonthlyEmployee,
  getPayrollComponents,
  getPayrollDashboard,
  getPayrollEmployeeHistory,
  getPayrollParameters,
  getPayrollReport,
  getPayrollRun,
  getPayrollRuns,
  getTerminationSettlement,
  downloadPayrollReportXlsx,
  upsertCompanySettings,
  upsertPayrollParameters,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { NumberTicker } from '../components/magic/number-ticker'
import { ShineBorder } from '../components/magic/shine-border'
import { buildBordroHtml } from '../lib/bordroDocument'
import type {
  CompanySettingsRecord,
  PayrollComponentKind,
  PayrollRunRecord,
  TerminationSettlement,
} from '../types/api'
import { EmployeeAutocompleteField } from '../components/EmployeeAutocompleteField'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useToast } from '../hooks/useToast'

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500'
const FIELD_INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
const FORM_SECTION = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4'
const FORM_SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700'

const KPI_TONES: Record<string, string> = {
  slate: 'text-slate-900',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  brand: 'text-brand-700',
}

const KPI_ACCENTS: Record<string, string> = {
  slate: 'before:bg-slate-300',
  emerald: 'before:bg-emerald-400',
  rose: 'before:bg-rose-300',
  brand: 'before:bg-brand-400',
}

function KpiCard({
  label,
  value,
  tone,
  shine,
  hint,
}: {
  label: string
  value: number
  tone: keyof typeof KPI_TONES
  shine?: boolean
  hint?: string
}) {
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${KPI_ACCENTS[tone]}`}
    >
      {shine ? <ShineBorder shineColor={['#0f5e72', '#34d399', '#0f5e72']} borderWidth={2} duration={9} /> : null}
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1.5 break-words font-mono text-lg font-semibold tracking-tight sm:text-2xl ${KPI_TONES[tone]}`}>
        <NumberTicker value={value} decimalPlaces={2} />
        <span className="ml-1 text-sm font-normal text-slate-400">TL</span>
      </p>
      {hint ? <p className="mt-1 truncate text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  )
}

function StatusBadge({ status, by }: { status: string; by?: string | null }) {
  const approved = status === 'APPROVED'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${approved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {approved ? 'ONAYLI' : 'TASLAK'}
      {approved && by ? <span className="font-normal text-emerald-600">· {by}</span> : null}
    </span>
  )
}

type ExportAction = { label: string; hint?: string; onClick: () => void }
type ExportGroup = { title: string; dot: string; actions: ExportAction[] }

function ExportMenu({ groups }: { groups: ExportGroup[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        Dışa Aktar
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5">
            {groups.map((group) => (
              <div key={group.title} className="py-1">
                <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${group.dot}`} />
                  {group.title}
                </p>
                {group.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      action.onClick()
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-700">{action.label}</span>
                    {action.hint ? <span className="text-[11px] text-slate-400">{action.hint}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

const MONTH_LABELS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

type ComponentPreset = {
  code: string
  label: string
  kind: PayrollComponentKind
  sgk_exempt: boolean
  income_tax_exempt: boolean
  stamp_tax_exempt: boolean
}

// Hazir kalem kategorileri: secince istisna bayraklari otomatik dolar.
const COMPONENT_PRESETS: ComponentPreset[] = [
  { code: 'PRIM', label: 'Prim', kind: 'EARNING', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'IKRAMIYE', label: 'İkramiye', kind: 'EARNING', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'MESAI_DUZELTME', label: 'Mesai Düzeltme', kind: 'EARNING', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'YOL', label: 'Yol Yardımı', kind: 'EARNING', sgk_exempt: true, income_tax_exempt: true, stamp_tax_exempt: false },
  { code: 'YEMEK', label: 'Yemek Yardımı', kind: 'EARNING', sgk_exempt: true, income_tax_exempt: true, stamp_tax_exempt: false },
  { code: 'DIGER_ODEME', label: 'Diğer Ödeme', kind: 'EARNING', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'AVANS', label: 'Avans Kesintisi', kind: 'DEDUCTION', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'ICRA', label: 'İcra / Nafaka', kind: 'DEDUCTION', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'BES', label: 'BES Kesintisi', kind: 'DEDUCTION', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
  { code: 'DIGER_KESINTI', label: 'Diğer Kesinti', kind: 'DEDUCTION', sgk_exempt: false, income_tax_exempt: false, stamp_tax_exempt: false },
]

function formatMoney(value: string | number): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return String(value)
  }
  return parsed.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, minutes)
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  return `${hours}s ${rest.toString().padStart(2, '0')}dk`
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export function PayrollPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()
  const now = new Date()

  const [runYear, setRunYear] = useState(String(now.getFullYear()))
  const [runMonth, setRunMonth] = useState(String(now.getMonth() + 1))
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [openReportEmployeeId, setOpenReportEmployeeId] = useState<number | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [showDashboard, setShowDashboard] = useState(true)
  const [histEmployeeId, setHistEmployeeId] = useState('')

  const [paramYear, setParamYear] = useState(String(now.getFullYear()))
  const [paramDivisor, setParamDivisor] = useState('225')
  const [paramFm1, setParamFm1] = useState('1.5')
  const [paramFm2, setParamFm2] = useState('2')
  const [paramFm3, setParamFm3] = useState('2')
  const [paramDeductMissing, setParamDeductMissing] = useState(true)
  const [paramSgkEmp, setParamSgkEmp] = useState('0.14')
  const [paramUnempEmp, setParamUnempEmp] = useState('0.01')
  const [paramSgkErRate, setParamSgkErRate] = useState('0.2075')
  const [paramUnempErRate, setParamUnempErRate] = useState('0.02')
  const [paramIncentiveRate, setParamIncentiveRate] = useState('0.05')
  const [paramApplyIncentive, setParamApplyIncentive] = useState(true)
  const [paramSgdpEmp, setParamSgdpEmp] = useState('0.075')
  const [paramSgdpEr, setParamSgdpEr] = useState('0.225')
  const [paramSgkBase, setParamSgkBase] = useState('33030')
  const [paramSgkCeiling, setParamSgkCeiling] = useState('297270')
  const [paramStampRate, setParamStampRate] = useState('0.00759')
  const [paramMinWage, setParamMinWage] = useState('33030')
  const [paramMinWageH2, setParamMinWageH2] = useState('')
  const [paramH2Month, setParamH2Month] = useState('7')
  const [paramDisab1, setParamDisab1] = useState('0')
  const [paramDisab2, setParamDisab2] = useState('0')
  const [paramDisab3, setParamDisab3] = useState('0')
  const [paramSeverance, setParamSeverance] = useState('0')
  const [paramsLoadedYear, setParamsLoadedYear] = useState<string | null>(null)

  // Cikis hesabi (kidem + ihbar)
  const [termEmployeeId, setTermEmployeeId] = useState('')
  const [termDate, setTermDate] = useState('')
  const [termBaseGross, setTermBaseGross] = useState('')
  const [termLeaveDays, setTermLeaveDays] = useState('')
  const [termIncludeNotice, setTermIncludeNotice] = useState(true)
  const [termResult, setTermResult] = useState<TerminationSettlement | null>(null)

  const emptyCompany: CompanySettingsRecord = {
    firma_unvan: '',
    merkez_adres: '',
    sube_adres: '',
    vergi_dairesi: '',
    vergi_no: '',
    ticaret_sicil_no: '',
    mersis_no: '',
    sgk_isyeri_no: '',
    internet_adresi: '',
    logo_hesap_ucret: '',
    logo_hesap_sgk_isveren: '',
    logo_hesap_net_odenecek: '',
    logo_hesap_odenecek_vergi: '',
    logo_hesap_odenecek_sgk: '',
    logo_hesap_personel_kesinti: '',
  }
  const [companyForm, setCompanyForm] = useState<CompanySettingsRecord>({ ...emptyCompany })
  const [companyLoaded, setCompanyLoaded] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'items' | 'params' | 'company' | 'cikis' | 'gecmis'>('items')

  // Ek kalemler (manuel prim/yol/avans...) sekmesi
  const [kompEmployeeId, setKompEmployeeId] = useState('')
  const [kompYear, setKompYear] = useState(String(now.getFullYear()))
  const [kompMonth, setKompMonth] = useState(String(now.getMonth() + 1))
  const [kompPreset, setKompPreset] = useState(COMPONENT_PRESETS[0].code)
  const [kompKind, setKompKind] = useState<PayrollComponentKind>('EARNING')
  const [kompLabel, setKompLabel] = useState(COMPONENT_PRESETS[0].label)
  const [kompAmount, setKompAmount] = useState('')
  const [kompLimit, setKompLimit] = useState('')
  const [kompSgkExempt, setKompSgkExempt] = useState(false)
  const [kompGvExempt, setKompGvExempt] = useState(false)
  const [kompStampExempt, setKompStampExempt] = useState(false)
  const [kompNote, setKompNote] = useState('')

  const applyPreset = (code: string) => {
    setKompPreset(code)
    const preset = COMPONENT_PRESETS.find((p) => p.code === code)
    if (!preset) return
    setKompKind(preset.kind)
    setKompLabel(preset.label)
    setKompSgkExempt(preset.sgk_exempt)
    setKompGvExempt(preset.income_tax_exempt)
    setKompStampExempt(preset.stamp_tax_exempt)
  }

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees({ include_inactive: true, status: 'all' }),
  })

  const runsQuery = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: getPayrollRuns,
  })

  const dashboardQuery = useQuery({
    queryKey: ['payroll-dashboard'],
    queryFn: () => getPayrollDashboard(12),
    enabled: showDashboard,
  })

  const historyQuery = useQuery({
    queryKey: ['payroll-employee-history', histEmployeeId],
    queryFn: () => getPayrollEmployeeHistory(Number(histEmployeeId)),
    enabled: settingsTab === 'gecmis' && !!histEmployeeId && Number.isInteger(Number(histEmployeeId)),
  })

  const runDetailQuery = useQuery({
    queryKey: ['payroll-run', selectedRunId ?? 'none'],
    queryFn: () => getPayrollRun(selectedRunId as number),
    enabled: selectedRunId !== null,
  })

  const parsedKompYear = Number(kompYear)
  const parsedKompMonth = Number(kompMonth)
  const componentsQuery = useQuery({
    queryKey: ['payroll-components', kompEmployeeId || 'all', kompYear, kompMonth],
    queryFn: () =>
      getPayrollComponents({
        ...(kompEmployeeId ? { employee_id: Number(kompEmployeeId) } : {}),
        ...(Number.isInteger(parsedKompYear) ? { year: parsedKompYear } : {}),
        ...(Number.isInteger(parsedKompMonth) ? { month: parsedKompMonth } : {}),
      }),
    enabled: settingsTab === 'items',
  })

  const reportQuery = useQuery({
    queryKey: ['payroll-report', selectedRunId ?? 'none'],
    queryFn: () => getPayrollReport(selectedRunId as number),
    enabled: selectedRunId !== null && showReport,
  })

  const reportRun = runDetailQuery.data ?? null
  const monthlyReportQuery = useQuery({
    queryKey: ['payroll-monthly-report', openReportEmployeeId, reportRun?.year, reportRun?.month],
    queryFn: () =>
      getMonthlyEmployee({
        employee_id: openReportEmployeeId as number,
        year: reportRun!.year,
        month: reportRun!.month,
      }),
    enabled: openReportEmployeeId !== null && reportRun !== null,
  })

  const companyQuery = useQuery({ queryKey: ['company-settings'], queryFn: getCompanySettings })
  if (companyQuery.data && !companyLoaded) {
    setCompanyLoaded(true)
    const d = companyQuery.data
    setCompanyForm({
      firma_unvan: d.firma_unvan ?? '',
      merkez_adres: d.merkez_adres ?? '',
      sube_adres: d.sube_adres ?? '',
      vergi_dairesi: d.vergi_dairesi ?? '',
      vergi_no: d.vergi_no ?? '',
      ticaret_sicil_no: d.ticaret_sicil_no ?? '',
      mersis_no: d.mersis_no ?? '',
      sgk_isyeri_no: d.sgk_isyeri_no ?? '',
      internet_adresi: d.internet_adresi ?? '',
      logo_hesap_ucret: d.logo_hesap_ucret ?? '',
      logo_hesap_sgk_isveren: d.logo_hesap_sgk_isveren ?? '',
      logo_hesap_net_odenecek: d.logo_hesap_net_odenecek ?? '',
      logo_hesap_odenecek_vergi: d.logo_hesap_odenecek_vergi ?? '',
      logo_hesap_odenecek_sgk: d.logo_hesap_odenecek_sgk ?? '',
      logo_hesap_personel_kesinti: d.logo_hesap_personel_kesinti ?? '',
    })
  }

  const parsedParamYear = Number(paramYear)
  const parametersQuery = useQuery({
    queryKey: ['payroll-parameters', paramYear],
    queryFn: () => getPayrollParameters(parsedParamYear),
    enabled: Number.isInteger(parsedParamYear) && parsedParamYear >= 2000 && parsedParamYear <= 2100,
  })

  // Parametreler yuklendiginde formu bir kez doldur (yil degisince tekrar).
  if (parametersQuery.data && paramsLoadedYear !== paramYear) {
    setParamsLoadedYear(paramYear)
    setParamDivisor(parametersQuery.data.monthly_hours_divisor)
    setParamFm1(parametersQuery.data.overtime_multiplier_fm1)
    setParamFm2(parametersQuery.data.overtime_multiplier_fm2)
    setParamFm3(parametersQuery.data.overtime_multiplier_fm3)
    setParamDeductMissing(parametersQuery.data.deduct_missing_minutes)
    setParamSgkEmp(parametersQuery.data.sgk_employee_rate)
    setParamUnempEmp(parametersQuery.data.unemployment_employee_rate)
    setParamSgkErRate(parametersQuery.data.sgk_employer_rate)
    setParamUnempErRate(parametersQuery.data.unemployment_employer_rate)
    setParamIncentiveRate(parametersQuery.data.sgk_employer_incentive_rate)
    setParamApplyIncentive(parametersQuery.data.apply_employer_incentive)
    setParamSgdpEmp(parametersQuery.data.sgdp_employee_rate)
    setParamSgdpEr(parametersQuery.data.sgdp_employer_rate)
    setParamSgkBase(parametersQuery.data.sgk_base_monthly)
    setParamSgkCeiling(parametersQuery.data.sgk_ceiling_monthly)
    setParamStampRate(parametersQuery.data.stamp_tax_rate)
    setParamMinWage(parametersQuery.data.minimum_wage_gross)
    setParamMinWageH2(parametersQuery.data.minimum_wage_gross_h2 ?? '')
    setParamH2Month(String(parametersQuery.data.minimum_wage_h2_month ?? 7))
    setParamDisab1(parametersQuery.data.disability_degree1_monthly ?? '0')
    setParamDisab2(parametersQuery.data.disability_degree2_monthly ?? '0')
    setParamDisab3(parametersQuery.data.disability_degree3_monthly ?? '0')
    setParamSeverance(parametersQuery.data.severance_ceiling_gross ?? '0')
  }

  const generateMutation = useMutation({
    mutationFn: generatePayrollRun,
    onSuccess: (run) => {
      setSelectedRunId(run.id)
      queryClient.setQueryData(['payroll-run', run.id], run)
      void queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['payroll-dashboard'] })
      pushToast({
        variant: 'success',
        title: 'Hakediş taslağı oluşturuldu',
        description: `${run.year}-${String(run.month).padStart(2, '0')} dönemi: ${run.item_count} çalışan hesaplandı${
          run.skipped_employees.length > 0 ? `, ${run.skipped_employees.length} çalışan maaş tanımsız` : ''
        }.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Hakediş taslağı oluşturulamadı.')
      pushToast({ variant: 'error', title: 'Hesaplama başarısız', description: parsed.message })
    },
  })

  const approveMutation = useMutation({
    mutationFn: approvePayrollRun,
    onSuccess: (run) => {
      queryClient.setQueryData(['payroll-run', run.id], run)
      void queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['payroll-dashboard'] })
      pushToast({
        variant: 'success',
        title: 'Hakediş onaylandı',
        description: `${run.year}-${String(run.month).padStart(2, '0')} dönemi donduruldu.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Hakediş onaylanamadı.')
      pushToast({ variant: 'error', title: 'Onay başarısız', description: parsed.message })
    },
  })

  const deleteRunMutation = useMutation({
    mutationFn: deletePayrollRun,
    onSuccess: (_, runId) => {
      if (selectedRunId === runId) {
        setSelectedRunId(null)
      }
      void queryClient.invalidateQueries({ queryKey: ['payroll-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['payroll-dashboard'] })
      pushToast({ variant: 'success', title: 'Taslak silindi', description: `Koşum #${runId} silindi.` })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Koşum silinemedi.')
      pushToast({ variant: 'error', title: 'Silme başarısız', description: parsed.message })
    },
  })

  const createKompMutation = useMutation({
    mutationFn: createPayrollComponent,
    onSuccess: () => {
      setKompAmount('')
      setKompLimit('')
      setKompNote('')
      void queryClient.invalidateQueries({ queryKey: ['payroll-components'] })
      pushToast({ variant: 'success', title: 'Kalem eklendi', description: 'Ek kalem kaydedildi. Taslağı yeniden hesaplayın.' })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Kalem eklenemedi.')
      pushToast({ variant: 'error', title: 'Kayıt başarısız', description: parsed.message })
    },
  })

  const deleteKompMutation = useMutation({
    mutationFn: deletePayrollComponent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-components'] })
      pushToast({ variant: 'success', title: 'Kalem silindi', description: 'Kayıt kaldırıldı.' })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Kalem silinemedi.')
      pushToast({ variant: 'error', title: 'Silme başarısız', description: parsed.message })
    },
  })

  const paramsMutation = useMutation({
    mutationFn: upsertPayrollParameters,
    onSuccess: (params) => {
      queryClient.setQueryData(['payroll-parameters', String(params.year)], params)
      pushToast({
        variant: 'success',
        title: 'Parametreler kaydedildi',
        description: `${params.year} yılı bordro parametreleri güncellendi.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Parametreler kaydedilemedi.')
      pushToast({ variant: 'error', title: 'Kayıt başarısız', description: parsed.message })
    },
  })


  const termMutation = useMutation({
    mutationFn: getTerminationSettlement,
    onSuccess: (data) => setTermResult(data),
    onError: (error) => {
      setTermResult(null)
      pushToast({ variant: 'error', title: 'Hesaplanamadı', description: parseApiError(error, 'Çıkış hesabı yapılamadı.').message })
    },
  })

  const companyMutation = useMutation({
    mutationFn: upsertCompanySettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      pushToast({ variant: 'success', title: 'Firma bilgileri kaydedildi', description: 'Bordro başlığı güncellendi.' })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Firma bilgileri kaydedilemedi.')
      pushToast({ variant: 'error', title: 'Kayıt başarısız', description: parsed.message })
    },
  })

  const onGenerate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const year = Number(runYear)
    const month = Number(runMonth)
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      pushToast({ variant: 'error', title: 'Geçersiz dönem', description: 'Yıl ve ay alanlarını kontrol edin.' })
      return
    }
    generateMutation.mutate({ year, month })
  }

  const onCreateComponent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const employeeId = Number(kompEmployeeId)
    const year = Number(kompYear)
    const month = Number(kompMonth)
    const amountRaw = kompAmount.trim().replace(',', '.')
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      pushToast({ variant: 'error', title: 'Çalışan seçin', description: 'Ek kalem için çalışan zorunlu.' })
      return
    }
    if (!kompLabel.trim()) {
      pushToast({ variant: 'error', title: 'Açıklama gerekli', description: 'Kalem açıklaması boş olamaz.' })
      return
    }
    if (!amountRaw || !Number.isFinite(Number(amountRaw)) || Number(amountRaw) <= 0) {
      pushToast({ variant: 'error', title: 'Geçersiz tutar', description: 'Tutar pozitif sayı olmalı.' })
      return
    }
    createKompMutation.mutate({
      employee_id: employeeId,
      year,
      month,
      kind: kompKind,
      code: COMPONENT_PRESETS.find((p) => p.code === kompPreset)?.code ?? null,
      label: kompLabel.trim(),
      amount: amountRaw,
      exempt_limit:
        kompKind === 'EARNING' && kompLimit.trim() ? kompLimit.trim().replace(',', '.') : null,
      sgk_exempt: kompKind === 'EARNING' ? kompSgkExempt : false,
      income_tax_exempt: kompKind === 'EARNING' ? kompGvExempt : false,
      stamp_tax_exempt: kompKind === 'EARNING' ? kompStampExempt : false,
      note: kompNote.trim() || null,
    })
  }

  const onSaveParameters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const year = Number(paramYear)
    const divisor = paramDivisor.trim().replace(',', '.')
    const fm1 = paramFm1.trim().replace(',', '.')
    const fm2 = paramFm2.trim().replace(',', '.')
    const fm3 = paramFm3.trim().replace(',', '.')
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      pushToast({ variant: 'error', title: 'Geçersiz yıl', description: 'Parametre yılını kontrol edin.' })
      return
    }
    for (const [label, value] of [
      ['Aylık saat böleni', divisor],
      ['FM1 çarpanı', fm1],
      ['FM2 çarpanı', fm2],
      ['FM3 çarpanı', fm3],
    ] as const) {
      if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0) {
        pushToast({ variant: 'error', title: 'Geçersiz değer', description: `${label} pozitif sayı olmalı.` })
        return
      }
    }
    paramsMutation.mutate({
      year,
      monthly_hours_divisor: divisor,
      overtime_multiplier_fm1: fm1,
      overtime_multiplier_fm2: fm2,
      overtime_multiplier_fm3: fm3,
      deduct_missing_minutes: paramDeductMissing,
      sgk_employee_rate: paramSgkEmp.trim().replace(',', '.'),
      unemployment_employee_rate: paramUnempEmp.trim().replace(',', '.'),
      sgk_employer_rate: paramSgkErRate.trim().replace(',', '.'),
      unemployment_employer_rate: paramUnempErRate.trim().replace(',', '.'),
      sgk_employer_incentive_rate: paramIncentiveRate.trim().replace(',', '.'),
      sgdp_employee_rate: paramSgdpEmp.trim().replace(',', '.'),
      sgdp_employer_rate: paramSgdpEr.trim().replace(',', '.'),
      apply_employer_incentive: paramApplyIncentive,
      sgk_base_monthly: paramSgkBase.trim().replace(',', '.'),
      sgk_ceiling_monthly: paramSgkCeiling.trim().replace(',', '.'),
      stamp_tax_rate: paramStampRate.trim().replace(',', '.'),
      minimum_wage_gross: paramMinWage.trim().replace(',', '.'),
      minimum_wage_gross_h2: paramMinWageH2.trim() ? paramMinWageH2.trim().replace(',', '.') : null,
      minimum_wage_h2_month: Number(paramH2Month) || 7,
      disability_degree1_monthly: paramDisab1.trim().replace(',', '.') || '0',
      disability_degree2_monthly: paramDisab2.trim().replace(',', '.') || '0',
      disability_degree3_monthly: paramDisab3.trim().replace(',', '.') || '0',
      severance_ceiling_gross: paramSeverance.trim().replace(',', '.') || '0',
    })
  }

  const openBordro = async (item: PayrollRunRecord['items'][number], year: number, month: number) => {
    try {
      const [company, profile, monthly] = await Promise.all([
        getCompanySettings().catch(() => null),
        item.employee_id ? getEmployeePayrollProfile(item.employee_id).catch(() => null) : Promise.resolve(null),
        item.employee_id
          ? getMonthlyEmployee({ employee_id: item.employee_id, year, month }).catch(() => null)
          : Promise.resolve(null),
      ])
      const html = buildBordroHtml({ item, company, profile, monthly, year, month })
      const popup = window.open('', '_blank', 'width=1180,height=820')
      if (!popup) {
        pushToast({ variant: 'error', title: 'Bordro açılamadı', description: 'Pop-up engelleyiciyi kapatın.' })
        return
      }
      popup.document.write(html)
      popup.document.close()
      popup.focus()
      popup.print()
    } catch {
      pushToast({ variant: 'error', title: 'Bordro oluşturulamadı', description: 'Lütfen tekrar deneyin.' })
    }
  }

  const handleExport = async (runId: number, year: number, month: number) => {
    try {
      const result = await downloadPayrollRunXlsx(runId)
      triggerBlobDownload(result.blob, result.file_name || `hakedis-${year}-${String(month).padStart(2, '0')}.xlsx`)
    } catch (error) {
      const parsed = parseApiError(error, 'Excel indirilemedi.')
      pushToast({ variant: 'error', title: 'İndirme başarısız', description: parsed.message })
    }
  }

  const handleReportExport = async (runId: number, year: number, month: number) => {
    try {
      const result = await downloadPayrollReportXlsx(runId)
      triggerBlobDownload(result.blob, result.file_name || `bordro-rapor-${year}-${String(month).padStart(2, '0')}.xlsx`)
    } catch (error) {
      const parsed = parseApiError(error, 'Rapor indirilemedi.')
      pushToast({ variant: 'error', title: 'İndirme başarısız', description: parsed.message })
    }
  }

  const handleBankExport = async (
    runId: number,
    year: number,
    month: number,
    format: 'xlsx' | 'txt',
  ) => {
    try {
      const result =
        format === 'xlsx' ? await downloadBankPaymentXlsx(runId) : await downloadBankPaymentTxt(runId)
      triggerBlobDownload(
        result.blob,
        result.file_name || `banka-odeme-${year}-${String(month).padStart(2, '0')}.${format}`,
      )
    } catch (error) {
      const parsed = parseApiError(error, 'Banka listesi indirilemedi.')
      pushToast({ variant: 'error', title: 'İndirme başarısız', description: parsed.message })
    }
  }

  const handleLogoExport = async (
    runId: number,
    year: number,
    month: number,
    kind: 'puantaj' | 'mahsup',
  ) => {
    try {
      const result =
        kind === 'puantaj' ? await downloadLogoPuantajXlsx(runId) : await downloadLogoMahsupXlsx(runId)
      triggerBlobDownload(
        result.blob,
        result.file_name || `logo-${kind}-${year}-${String(month).padStart(2, '0')}.xlsx`,
      )
    } catch (error) {
      const parsed = parseApiError(error, 'Logo aktarımı indirilemedi.')
      pushToast({ variant: 'error', title: 'İndirme başarısız', description: parsed.message })
    }
  }

  if (employeesQuery.isLoading) {
    return <LoadingBlock />
  }
  if (employeesQuery.isError) {
    return <ErrorBlock message="Çalışan listesi alınamadı." />
  }

  const employees = employeesQuery.data ?? []
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.full_name]))
  const runs = runsQuery.data ?? []
  const runDetail = runDetailQuery.data ?? null
  const components = componentsQuery.data ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bordro / Hakediş"
        description="Aylık hakediş hesaplayın, onaylayıp dondurun ve ücret pusulasını Excel olarak alın."
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={FORM_SECTION_TITLE}>Bordro Panosu</p>
            <h4 className="mt-2 text-base font-semibold text-slate-900">Son Dönem Özeti & Trend</h4>
          </div>
          <button
            type="button"
            onClick={() => setShowDashboard((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showDashboard ? 'Panoyu Gizle' : 'Panoyu Göster'}
          </button>
        </div>
        {showDashboard ? (
          dashboardQuery.isLoading ? (
            <LoadingBlock />
          ) : dashboardQuery.data && dashboardQuery.data.rows.length > 0 ? (
            <>
              {dashboardQuery.data.latest ? (
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard label={`Brüt (${dashboardQuery.data.latest.year}-${String(dashboardQuery.data.latest.month).padStart(2, '0')})`} tone="slate" value={Number(dashboardQuery.data.latest.gross_total)} />
                  <KpiCard label="Net Ödenen" tone="emerald" shine value={Number(dashboardQuery.data.latest.net_total)} />
                  <KpiCard label="İşveren Maliyet" tone="brand" value={Number(dashboardQuery.data.latest.employer_cost_total)} />
                  <div className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Çalışan</p>
                    <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900">{dashboardQuery.data.latest.employee_count}</p>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Dönem</th>
                      <th className="py-2 pr-3">Durum</th>
                      <th className="py-2 pr-3 text-right">Çalışan</th>
                      <th className="py-2 pr-3 text-right">Brüt Toplam</th>
                      <th className="py-2 pr-3 text-right">Net</th>
                      <th className="py-2 text-right">İşveren Maliyet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dashboardQuery.data.rows].reverse().map((r) => (
                      <tr key={`${r.year}-${r.month}`} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-800">{r.year}-{String(r.month).padStart(2, '0')}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {r.status === 'APPROVED' ? 'ONAYLI' : 'TASLAK'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right">{r.employee_count}</td>
                        <td className="py-2 pr-3 text-right">{formatMoney(r.gross_total)}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{formatMoney(r.net_total)}</td>
                        <td className="py-2 text-right font-semibold text-slate-700">{formatMoney(r.employer_cost_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Henüz koşum yok. İlk taslağı hesaplayın.</p>
          )
        ) : null}
      </Panel>

      <Panel>
        <p className={FORM_SECTION_TITLE}>Dönem Koşumu</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Hakediş Hesapla</h4>
        <p className="mt-1 text-sm text-slate-500">
          Seçilen ay için tüm aktif çalışanların puantajından taslak hakediş üretilir. Maaş tanımı olmayan çalışanlar
          atlanır ve listelenir. Taslak yeniden hesaplanabilir; onaylanan dönem donar.
        </p>

        <form onSubmit={onGenerate} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block w-28">
            <span className={FIELD_LABEL}>Yıl</span>
            <input value={runYear} onChange={(event) => setRunYear(event.target.value)} inputMode="numeric" className={FIELD_INPUT} />
          </label>
          <label className="block w-40">
            <span className={FIELD_LABEL}>Ay</span>
            <select value={runMonth} onChange={(event) => setRunMonth(event.target.value)} className={FIELD_INPUT}>
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {String(index + 1).padStart(2, '0')} - {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={generateMutation.isPending}
            className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {generateMutation.isPending ? 'Hesaplanıyor...' : 'Taslak Hesapla'}
          </button>
        </form>

        {runsQuery.isLoading ? <LoadingBlock /> : null}
        {runsQuery.isError ? <ErrorBlock message="Koşum listesi alınamadı." /> : null}
        {!runsQuery.isLoading && !runsQuery.isError ? (
          runs.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Dönem</th>
                    <th className="py-2">Durum</th>
                    <th className="py-2">Çalışan</th>
                    <th className="py-2">Brüt Toplam</th>
                    <th className="py-2">Onay</th>
                    <th className="py-2 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className={`border-t border-slate-100 ${selectedRunId === run.id ? 'bg-sky-50/70' : ''}`}
                    >
                      <td className="py-2 font-medium text-slate-800">
                        {run.year}-{String(run.month).padStart(2, '0')}
                      </td>
                      <td className="py-2">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="py-2">{run.item_count}</td>
                      <td className="py-2 font-medium">{formatMoney(run.gross_total_sum)} TL</td>
                      <td className="py-2 text-xs text-slate-500">
                        {run.approved_by ? `${run.approved_by}` : '-'}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRunId(run.id)}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            Detay
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExport(run.id, run.year, run.month)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Excel
                          </button>
                          {run.status === 'DRAFT' ? (
                            <button
                              type="button"
                              disabled={deleteRunMutation.isPending}
                              onClick={() => deleteRunMutation.mutate(run.id)}
                              className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Sil
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Henüz hakediş koşumu yok. Yukarıdan ilk taslağı hesaplayın.</p>
          )
        ) : null}
      </Panel>

      {selectedRunId !== null ? (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={FORM_SECTION_TITLE}>Koşum Detayı</p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <h4 className="text-base font-semibold text-slate-900">
                  {runDetail ? `${runDetail.year}-${String(runDetail.month).padStart(2, '0')} Hakediş Kalemleri` : 'Yükleniyor...'}
                </h4>
                {runDetail ? <StatusBadge status={runDetail.status} by={runDetail.approved_by} /> : null}
              </div>
              {runDetail ? (
                <p className="mt-1 text-xs text-slate-500">
                  {runDetail.items.length} çalışan · {MONTH_LABELS[runDetail.month - 1]} {runDetail.year}
                </p>
              ) : null}
            </div>
            {runDetail ? (
              <div className="flex flex-wrap items-center gap-2">
                <ExportMenu
                  groups={[
                    {
                      title: 'Resmi Belgeler',
                      dot: 'bg-slate-400',
                      actions: [
                        {
                          label: 'Hakediş (Excel)',
                          hint: 'xlsx',
                          onClick: () => void handleExport(runDetail.id, runDetail.year, runDetail.month),
                        },
                        {
                          label: 'Bordro Raporu (Excel)',
                          hint: 'xlsx',
                          onClick: () => void handleReportExport(runDetail.id, runDetail.year, runDetail.month),
                        },
                      ],
                    },
                    {
                      title: 'Banka Ödeme',
                      dot: 'bg-sky-400',
                      actions: [
                        {
                          label: 'Banka Listesi',
                          hint: 'xlsx',
                          onClick: () => void handleBankExport(runDetail.id, runDetail.year, runDetail.month, 'xlsx'),
                        },
                        {
                          label: 'Banka Talimatı',
                          hint: 'txt',
                          onClick: () => void handleBankExport(runDetail.id, runDetail.year, runDetail.month, 'txt'),
                        },
                      ],
                    },
                    {
                      title: 'Logo Aktarımı',
                      dot: 'bg-amber-400',
                      actions: [
                        {
                          label: 'Logo Puantaj',
                          hint: 'xlsx',
                          onClick: () => void handleLogoExport(runDetail.id, runDetail.year, runDetail.month, 'puantaj'),
                        },
                        {
                          label: 'Logo Mahsup Fişi',
                          hint: 'xlsx',
                          onClick: () => void handleLogoExport(runDetail.id, runDetail.year, runDetail.month, 'mahsup'),
                        },
                      ],
                    },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => setShowReport((v) => !v)}
                  className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  {showReport ? 'Raporları Gizle' : 'Raporlar'}
                </button>
                {runDetail.status === 'DRAFT' ? (
                  <button
                    type="button"
                    disabled={approveMutation.isPending || runDetail.items.length === 0}
                    onClick={() => approveMutation.mutate(runDetail.id)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {approveMutation.isPending ? 'Onaylanıyor...' : 'Onayla ve Dondur'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {runDetailQuery.isLoading ? <LoadingBlock /> : null}
          {runDetailQuery.isError ? <ErrorBlock message="Koşum detayı alınamadı." /> : null}

          {runDetail && runDetail.items.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Brüt Toplam" tone="slate" value={runDetail.items.reduce((s, i) => s + Number(i.gross_total), 0)} />
              <KpiCard
                label="Net Ödenen"
                tone="emerald"
                shine
                value={runDetail.items.reduce((s, i) => s + Number(i.net_total), 0)}
              />
              <KpiCard
                label="Toplam Kesinti"
                tone="rose"
                value={runDetail.items.reduce(
                  (s, i) =>
                    s +
                    Number(i.sgk_employee) +
                    Number(i.unemployment_employee) +
                    Number(i.income_tax_payable) +
                    Number(i.stamp_tax_payable),
                  0,
                )}
              />
              <KpiCard
                label="İşveren Maliyeti"
                tone="brand"
                value={runDetail.items.reduce((s, i) => s + Number(i.employer_cost_total), 0)}
              />
            </div>
          ) : null}

          {runDetail && runDetail.skipped_employees.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Maaş tanımı olmadığı için atlanan çalışanlar:</p>
              <p className="mt-1">
                {runDetail.skipped_employees.map((item) => item.employee_name).join(', ')}
              </p>
              <p className="mt-1 text-xs">
                Aşağıdaki Maaş Tanımları bölümünden brüt maaş girip taslağı yeniden hesaplayın.
              </p>
            </div>
          ) : null}

          {runDetail ? (
            runDetail.items.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Çalışan</th>
                      <th className="py-2 pr-3 text-right">Brüt Maaş</th>
                      <th className="py-2 pr-3 text-right">Fazla Mesai</th>
                      <th className="py-2 pr-3 text-right">Brüt Hakediş</th>
                      <th className="py-2 pr-3 text-right">Kesintiler</th>
                      <th className="py-2 pr-3 text-right">NET</th>
                      <th className="py-2 text-right">İşveren Maliyeti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetail.items.map((item) => {
                      const fazlaMesai =
                        Number(item.overtime_fm1_amount) +
                        Number(item.overtime_fm2_amount) +
                        Number(item.overtime_fm3_amount)
                      const fmMinutes = item.fm1_minutes + item.fm2_minutes + item.fm3_minutes
                      const sgkKesinti = Number(item.sgk_employee) + Number(item.unemployment_employee)
                      const vergi = Number(item.income_tax_payable) + Number(item.stamp_tax_payable)
                      const toplamKesinti = sgkKesinti + vergi + Number(item.additional_deductions)
                      return (
                      <Fragment key={item.id}>
                      <tr className="border-t border-slate-100 align-top">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-800">{item.employee_name}</div>
                          <div className="text-xs text-slate-500">
                            {item.department_name ?? '-'} · SGK {item.sgk_days} gün
                          </div>
                          {item.incomplete_days > 0 ? (
                            <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                              {item.incomplete_days} gün eksik IN/OUT
                            </span>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openBordro(item, runDetail.year, runDetail.month)}
                              className="rounded-md border border-brand-300 px-2 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                            >
                              Bordro Yazdır
                            </button>
                            {item.employee_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenReportEmployeeId((current) =>
                                    current === item.employee_id ? null : item.employee_id,
                                  )
                                }
                                className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {openReportEmployeeId === item.employee_id ? 'Detayı Gizle' : 'Detay'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">{formatMoney(item.gross_monthly)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                          {fazlaMesai > 0 ? formatMoney(fazlaMesai) : '-'}
                          {fmMinutes > 0 ? (
                            <span className="block text-[10px] font-normal text-slate-400">{formatMinutes(fmMinutes)}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900">
                          {formatMoney(Number(item.gross_total) + Number(item.additional_earnings))}
                          {Number(item.additional_earnings) > 0 ? (
                            <span className="block text-[10px] font-normal text-emerald-600">+ek ödeme {formatMoney(item.additional_earnings)}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-rose-700">
                          -{formatMoney(toplamKesinti)}
                          <span className="block text-[10px] font-normal text-slate-400">
                            SGK {formatMoney(sgkKesinti)} · Vergi {formatMoney(vergi)}
                            {Number(item.additional_deductions) > 0 ? ` · Kesinti ${formatMoney(item.additional_deductions)}` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-base font-bold tabular-nums text-emerald-700">
                          {formatMoney(item.net_total)}
                          {item.compensation_basis === 'NET' ? (
                            <span className="block text-[10px] font-semibold text-violet-600">NET garantili</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-slate-700">
                          {formatMoney(item.employer_cost_total)}
                          {Number(item.employer_incentive) > 0 ? (
                            <span className="block text-[10px] font-normal text-emerald-600">teşvik -{formatMoney(item.employer_incentive)}</span>
                          ) : null}
                        </td>
                      </tr>
                      {openReportEmployeeId === item.employee_id ? (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="px-3 py-3">
                            {monthlyReportQuery.isLoading ? (
                              <p className="text-xs text-slate-500">Aylık rapor yükleniyor...</p>
                            ) : monthlyReportQuery.data ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  {item.employee_name} — Aylık Çalışan Raporu
                                </p>
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
                                  <span>Çalışma: <b>{formatMinutes(monthlyReportQuery.data.totals.worked_minutes)}</b></span>
                                  <span>FM1: <b>{formatMinutes(monthlyReportQuery.data.totals.fm1_minutes)}</b></span>
                                  <span>FM2: <b>{formatMinutes(monthlyReportQuery.data.totals.fm2_minutes)}</b></span>
                                  <span>FM3: <b>{formatMinutes(monthlyReportQuery.data.totals.fm3_minutes)}</b></span>
                                  <span>Eksik: <b>{formatMinutes(monthlyReportQuery.data.days.reduce((s, d) => s + d.missing_minutes, 0))}</b></span>
                                  <span>Eksik IN/OUT gün: <b>{monthlyReportQuery.data.totals.incomplete_days}</b></span>
                                  <span>SGK günü: <b>{item.sgk_days}</b></span>
                                  <span>Mola: <b>{formatMinutes(monthlyReportQuery.data.totals.break_taken_minutes ?? 0)}</b></span>
                                </div>
                                <div className="flex flex-wrap gap-0.5 pt-1">
                                  {monthlyReportQuery.data.days.map((day) => {
                                    const code =
                                      day.leave_type === 'UNPAID'
                                        ? 'Z'
                                        : day.leave_type === 'ANNUAL'
                                          ? 'Y'
                                          : day.leave_type
                                            ? 'Ü'
                                            : day.day_type === 'SUNDAY' || day.day_type === 'WEEKLY_REST'
                                              ? 'T'
                                              : day.status === 'OK'
                                                ? 'N'
                                                : day.status === 'INCOMPLETE'
                                                  ? 'M'
                                                  : '-'
                                    const dn = new Date(day.date).getDate()
                                    return (
                                      <span
                                        key={day.date}
                                        title={`${day.date}: ${code}`}
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${
                                          code === 'N'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : code === 'T'
                                              ? 'bg-slate-200 text-slate-600'
                                              : code === 'Z' || code === 'M'
                                                ? 'bg-rose-100 text-rose-700'
                                                : 'bg-amber-100 text-amber-700'
                                        }`}
                                      >
                                        {dn}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-rose-600">Aylık rapor alınamadı.</p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Bu koşumda kalem yok. Maaş tanımlarını kontrol edip yeniden hesaplayın.
              </p>
            )
          ) : null}
        </Panel>
      ) : null}

      {selectedRunId !== null && showReport ? (
        <Panel>
          <p className={FORM_SECTION_TITLE}>Bordro Raporları</p>
          <h4 className="mt-2 text-base font-semibold text-slate-900">
            {reportQuery.data ? `${reportQuery.data.year}-${String(reportQuery.data.month).padStart(2, '0')} İcmal & Tahakkuk` : 'Yükleniyor...'}
          </h4>
          {reportQuery.isLoading ? <LoadingBlock /> : null}
          {reportQuery.isError ? <ErrorBlock message="Rapor alınamadı." /> : null}
          {reportQuery.data ? (
            <div className="mt-4 space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Departman Maliyet Dağılımı</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Departman</th>
                        <th className="py-2 pr-3 text-right">Çalışan</th>
                        <th className="py-2 pr-3 text-right">Brüt Toplam</th>
                        <th className="py-2 pr-3 text-right">Ek Ödeme</th>
                        <th className="py-2 pr-3 text-right">NET</th>
                        <th className="py-2 text-right">İşveren Maliyet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportQuery.data.by_department.map((r) => (
                        <tr key={r.department_name} className="border-t border-slate-100">
                          <td className="py-2 pr-3 font-medium text-slate-800">{r.department_name}</td>
                          <td className="py-2 pr-3 text-right">{r.employee_count}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.gross_total)}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.additional_earnings)}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{formatMoney(r.net_total)}</td>
                          <td className="py-2 text-right font-semibold text-slate-700">{formatMoney(r.employer_cost_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">SGK Tahakkuk Özeti</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">SGK Statü</th>
                        <th className="py-2 pr-3">Kanun</th>
                        <th className="py-2 pr-3 text-right">Çalışan</th>
                        <th className="py-2 pr-3 text-right">SGK Gün</th>
                        <th className="py-2 pr-3 text-right">SGK Matrah</th>
                        <th className="py-2 pr-3 text-right">SGK İşçi</th>
                        <th className="py-2 pr-3 text-right">SGK İşveren</th>
                        <th className="py-2 text-right">Teşvik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportQuery.data.sgk_accrual.map((r) => (
                        <tr key={`${r.sgk_status}-${r.kanun_no}`} className="border-t border-slate-100">
                          <td className="py-2 pr-3">{r.sgk_status}</td>
                          <td className="py-2 pr-3">{r.kanun_no}</td>
                          <td className="py-2 pr-3 text-right">{r.employee_count}</td>
                          <td className="py-2 pr-3 text-right">{r.sgk_days}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.sgk_base)}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.sgk_employee)}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.sgk_employer)}</td>
                          <td className="py-2 text-right text-emerald-700">{formatMoney(r.employer_incentive)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Gelir Vergisi (Muhtasar) Listesi</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Çalışan</th>
                        <th className="py-2 pr-3 text-right">GV Matrah</th>
                        <th className="py-2 pr-3 text-right">Dev. Matrah</th>
                        <th className="py-2 pr-3 text-right">GV Hesaplanan</th>
                        <th className="py-2 pr-3 text-right">İstisna</th>
                        <th className="py-2 pr-3 text-right">GV Ödenecek</th>
                        <th className="py-2 text-right">Damga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportQuery.data.tax_lines.map((r) => (
                        <tr key={r.employee_name} className="border-t border-slate-100">
                          <td className="py-2 pr-3 font-medium text-slate-800">{r.employee_name}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.income_tax_base)}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.cumulative_income_tax_base)}</td>
                          <td className="py-2 pr-3 text-right">{formatMoney(r.income_tax_calculated)}</td>
                          <td className="py-2 pr-3 text-right text-emerald-600">{formatMoney(r.income_tax_exemption)}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-rose-700">{formatMoney(r.income_tax_payable)}</td>
                          <td className="py-2 text-right text-rose-700">{formatMoney(r.stamp_tax_payable)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([
          ['items', 'Ek Kalemler'],
          ['gecmis', 'Geçmiş'],
          ['cikis', 'Çıkış Hesabı'],
          ['params', 'Parametreler'],
          ['company', 'Firma Bilgileri'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSettingsTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              settingsTab === key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        Maaş tanımları ve özlük bilgileri artık{' '}
        <Link to="/ozluk" className="font-semibold text-brand-700 underline">
          Özlük Yönetimi
        </Link>{' '}
        sayfasından yönetilir.
      </p>

      {settingsTab === 'items' ? (
      <Panel>
        <p className={FORM_SECTION_TITLE}>Ek Kalemler</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Manuel Ek Ödeme / Kesinti</h4>
        <p className="mt-1 text-sm text-slate-500">
          Çalışan + ay bazlı prim, ikramiye, yol/yemek (istisnalı), avans, icra, BES gibi kalemler. Hazır kategori
          seçince vergi/SGK istisna bayrakları otomatik dolar. Ek ödeme brüte, ek kesinti nete eklenir. Kalem
          girdikten sonra ilgili dönemin taslağını <b>yeniden hesaplayın</b>.
        </p>

        <form onSubmit={onCreateComponent} className={`mt-4 ${FORM_SECTION}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <EmployeeAutocompleteField
              label="Çalışan"
              employees={employees}
              value={kompEmployeeId}
              onChange={setKompEmployeeId}
              emptyLabel="Seçiniz"
              labelClassName="block"
              labelTextClassName={FIELD_LABEL}
              inputClassName={FIELD_INPUT}
            />
            <label className="block w-full">
              <span className={FIELD_LABEL}>Yıl</span>
              <input value={kompYear} onChange={(event) => setKompYear(event.target.value)} inputMode="numeric" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Ay</span>
              <select value={kompMonth} onChange={(event) => setKompMonth(event.target.value)} className={FIELD_INPUT}>
                {MONTH_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {String(index + 1).padStart(2, '0')} - {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Kategori</span>
              <select value={kompPreset} onChange={(event) => applyPreset(event.target.value)} className={FIELD_INPUT}>
                <optgroup label="Ek Ödeme">
                  {COMPONENT_PRESETS.filter((p) => p.kind === 'EARNING').map((p) => (
                    <option key={p.code} value={p.code}>{p.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Ek Kesinti">
                  {COMPONENT_PRESETS.filter((p) => p.kind === 'DEDUCTION').map((p) => (
                    <option key={p.code} value={p.code}>{p.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Açıklama</span>
              <input value={kompLabel} onChange={(event) => setKompLabel(event.target.value)} className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Tür</span>
              <select
                value={kompKind}
                onChange={(event) => setKompKind(event.target.value as PayrollComponentKind)}
                className={FIELD_INPUT}
              >
                <option value="EARNING">Ek Ödeme (brüte)</option>
                <option value="DEDUCTION">Ek Kesinti (netten)</option>
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Tutar (TL)</span>
              <input value={kompAmount} onChange={(event) => setKompAmount(event.target.value)} inputMode="decimal" placeholder="Örn: 5000" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Not</span>
              <input value={kompNote} onChange={(event) => setKompNote(event.target.value)} placeholder="Opsiyonel" className={FIELD_INPUT} />
            </label>
          </div>

          {kompKind === 'EARNING' ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block w-44">
                <span className={FIELD_LABEL}>İstisna Tavanı (TL/ay)</span>
                <input
                  value={kompLimit}
                  onChange={(event) => setKompLimit(event.target.value)}
                  inputMode="decimal"
                  placeholder="Boş = tüm tutar"
                  className={FIELD_INPUT}
                />
              </label>
              {([
                ['SGK istisnası', kompSgkExempt, setKompSgkExempt],
                ['Gelir V. istisnası', kompGvExempt, setKompGvExempt],
                ['Damga istisnası', kompStampExempt, setKompStampExempt],
              ] as const).map(([label, checked, setter]) => (
                <label
                  key={label}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                  {label}
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Ek kesinti vergi sonrası net tutardan düşülür (istisna bayrağı uygulanmaz).</p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={createKompMutation.isPending}
              className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {createKompMutation.isPending ? 'Kaydediliyor...' : 'Kalem Ekle'}
            </button>
          </div>
        </form>

        {componentsQuery.isLoading ? <LoadingBlock /> : null}
        {componentsQuery.isError ? <ErrorBlock message="Ek kalemler alınamadı." /> : null}
        {!componentsQuery.isLoading && !componentsQuery.isError ? (
          components.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Çalışan</th>
                    <th className="py-2">Dönem</th>
                    <th className="py-2">Tür</th>
                    <th className="py-2">Açıklama</th>
                    <th className="py-2 text-right">Tutar</th>
                    <th className="py-2">İstisna</th>
                    <th className="py-2 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2">{employeeNameById.get(item.employee_id) ?? `#${item.employee_id}`}</td>
                      <td className="py-2">{item.year}-{String(item.month).padStart(2, '0')}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.kind === 'EARNING' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {item.kind === 'EARNING' ? 'EK ÖDEME' : 'EK KESİNTİ'}
                        </span>
                      </td>
                      <td className="py-2 text-slate-700">{item.label}{item.note ? <span className="block text-[11px] text-slate-400">{item.note}</span> : null}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(item.amount)} TL</td>
                      <td className="py-2 text-[11px] text-slate-500">
                        {item.kind === 'EARNING' ? (
                          <>
                            {[item.sgk_exempt ? 'SGK' : null, item.income_tax_exempt ? 'GV' : null, item.stamp_tax_exempt ? 'Damga' : null]
                              .filter(Boolean)
                              .join(', ') || 'tam vergili'}
                            {item.exempt_limit ? <span className="block text-slate-400">tavan {formatMoney(item.exempt_limit)}</span> : null}
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={deleteKompMutation.isPending}
                          onClick={() => deleteKompMutation.mutate(item.id)}
                          className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Seçilen filtre için ek kalem yok.</p>
          )
        ) : null}
      </Panel>
      ) : null}

      {settingsTab === 'gecmis' ? (
      <Panel>
        <p className={FORM_SECTION_TITLE}>Geçmiş</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Pusula Geçmişi & Zam Geçmişi</h4>
        <p className="mt-1 text-sm text-slate-500">
          Çalışan seçince geçmiş tüm dönem pusulaları (brüt/net/işveren maliyet) ve maaş/zam zaman çizelgesi listelenir.
        </p>
        <div className={`mt-4 ${FORM_SECTION}`}>
          <EmployeeAutocompleteField
            label="Çalışan"
            employees={employees}
            value={histEmployeeId}
            onChange={setHistEmployeeId}
            emptyLabel="Seçiniz"
            labelClassName="block max-w-sm"
            labelTextClassName={FIELD_LABEL}
            inputClassName={FIELD_INPUT}
          />
        </div>

        {histEmployeeId ? (
          historyQuery.isLoading ? (
            <LoadingBlock />
          ) : historyQuery.isError ? (
            <ErrorBlock message="Geçmiş alınamadı." />
          ) : historyQuery.data ? (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pusula Geçmişi</p>
                {historyQuery.data.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Dönem</th>
                          <th className="py-2 pr-3 text-right">Brüt Toplam</th>
                          <th className="py-2 pr-3 text-right">Net</th>
                          <th className="py-2 text-right">İşveren Mly.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyQuery.data.items.map((it) => (
                          <tr key={it.payroll_item_id} className="border-t border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-800">
                              {it.year}-{String(it.month).padStart(2, '0')}
                              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${it.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {it.status === 'APPROVED' ? 'ONAYLI' : 'TASLAK'}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right">{formatMoney(it.gross_total)}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{formatMoney(it.net_total)}</td>
                            <td className="py-2 text-right text-slate-700">{formatMoney(it.employer_cost_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Bu çalışan için geçmiş pusula yok.</p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Zam / Maaş Geçmişi</p>
                {historyQuery.data.compensations.length > 0 ? (
                  <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
                    {historyQuery.data.compensations.map((c) => (
                      <li key={c.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {formatMoney(c.basis === 'NET' ? c.net_monthly ?? '0' : c.gross_monthly)} TL
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.basis === 'NET' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                              {c.basis === 'NET' ? 'NET' : 'BRÜT'}
                            </span>
                          </span>
                          <span className="text-xs text-slate-500">{c.effective_from}</span>
                        </div>
                        {c.note ? <p className="text-xs text-slate-400">{c.note}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">Maaş tanımı yok.</p>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <p className="mt-4 text-sm text-slate-500">Geçmişi görmek için çalışan seçin.</p>
        )}
      </Panel>
      ) : null}

      {settingsTab === 'cikis' ? (
      <Panel>
        <p className={FORM_SECTION_TITLE}>Çıkış Hesabı</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Kıdem & İhbar Tazminatı</h4>
        <p className="mt-1 text-sm text-slate-500">
          İşe giriş tarihi (Çalışan Özlük) ile çıkış tarihi arasından kıdem hesaplanır. Kıdem tazminatı gelir
          vergisinden istisnadır (yalnız damga); tavan Parametreler sekmesinden ayarlanır. İhbar tazminatı gelir
          vergisine tabidir (tek seferlik tahmini). Giydirilmiş brüt boş bırakılırsa son brüt maaş kullanılır.
        </p>
        <div className={`mt-4 ${FORM_SECTION}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <EmployeeAutocompleteField
              label="Çalışan"
              employees={employees}
              value={termEmployeeId}
              onChange={setTermEmployeeId}
              emptyLabel="Seçiniz"
              labelClassName="block"
              labelTextClassName={FIELD_LABEL}
              inputClassName={FIELD_INPUT}
            />
            <label className="block">
              <span className={FIELD_LABEL}>Çıkış Tarihi</span>
              <input type="date" value={termDate} onChange={(event) => setTermDate(event.target.value)} className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Giydirilmiş Brüt (TL)</span>
              <input value={termBaseGross} onChange={(event) => setTermBaseGross(event.target.value)} inputMode="decimal" placeholder="Boş = son maaş" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Kullanılmamış İzin (gün)</span>
              <input value={termLeaveDays} onChange={(event) => setTermLeaveDays(event.target.value)} inputMode="decimal" placeholder="Opsiyonel" className={FIELD_INPUT} />
            </label>
            <label className={`mt-6 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${termIncludeNotice ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
              <input type="checkbox" checked={termIncludeNotice} onChange={(event) => setTermIncludeNotice(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              İhbar dahil
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={termMutation.isPending}
              onClick={() => {
                const id = Number(termEmployeeId)
                if (!Number.isInteger(id) || id <= 0) {
                  pushToast({ variant: 'error', title: 'Çalışan seçin', description: 'Çıkış hesabı için çalışan zorunlu.' })
                  return
                }
                if (!termDate) {
                  pushToast({ variant: 'error', title: 'Tarih gerekli', description: 'Çıkış tarihi seçin.' })
                  return
                }
                termMutation.mutate({
                  employee_id: id,
                  termination_date: termDate,
                  base_gross_monthly: termBaseGross.trim() ? termBaseGross.trim().replace(',', '.') : undefined,
                  include_notice: termIncludeNotice,
                  unused_leave_days: termLeaveDays.trim() ? termLeaveDays.trim().replace(',', '.') : undefined,
                })
              }}
              className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {termMutation.isPending ? 'Hesaplanıyor...' : 'Hesapla'}
            </button>
          </div>
        </div>

        {termResult ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hizmet & Taban</p>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div className="flex justify-between"><span>Çalışan</span><b>{termResult.employee_name}</b></div>
                <div className="flex justify-between"><span>İşe Giriş → Çıkış</span><b>{termResult.hire_date} → {termResult.termination_date}</b></div>
                <div className="flex justify-between"><span>Kıdem</span><b>{termResult.service_label} ({termResult.service_days} gün)</b></div>
                <div className="flex justify-between"><span>Giydirilmiş Brüt</span><b>{formatMoney(termResult.base_gross)} TL</b></div>
                <div className="flex justify-between"><span>Kıdem Tazminat Tabanı</span><b>{formatMoney(termResult.severance_base_monthly)} TL{termResult.ceiling_applied ? ' (tavan)' : ''}</b></div>
                {Number(termResult.unused_leave_gross) > 0 ? (
                  <div className="flex justify-between"><span>Kullanılmamış İzin ({termResult.unused_leave_days} gün)</span><b>{formatMoney(termResult.unused_leave_gross)} TL brüt</b></div>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Tazminat</p>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div className="flex justify-between"><span>Kıdem Brüt</span><b>{formatMoney(termResult.severance_gross)} TL</b></div>
                <div className="flex justify-between text-rose-700"><span>Kıdem Damga</span><span>-{formatMoney(termResult.severance_stamp)}</span></div>
                <div className="flex justify-between"><span>Kıdem Net</span><b className="text-emerald-700">{formatMoney(termResult.severance_net)} TL</b></div>
                <div className="mt-2 flex justify-between border-t border-emerald-200 pt-2"><span>İhbar Brüt ({termResult.notice_weeks} hafta)</span><b>{formatMoney(termResult.notice_gross)} TL</b></div>
                <div className="flex justify-between text-rose-700"><span>İhbar Gelir V. (tahmini)</span><span>-{formatMoney(termResult.notice_income_tax)}</span></div>
                <div className="flex justify-between text-rose-700"><span>İhbar Damga</span><span>-{formatMoney(termResult.notice_stamp)}</span></div>
                <div className="flex justify-between"><span>İhbar Net</span><b className="text-emerald-700">{formatMoney(termResult.notice_net)} TL</b></div>
                <div className="mt-2 flex justify-between border-t border-emerald-300 pt-2 text-base"><span className="font-semibold">TOPLAM NET</span><b className="text-emerald-700">{formatMoney(termResult.total_net)} TL</b></div>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>
      ) : null}

      {settingsTab === 'params' ? (
      <Panel>
        <p className={FORM_SECTION_TITLE}>Parametreler</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Yıl Bazlı Bordro Parametreleri</h4>
        <p className="mt-1 text-sm text-slate-500">
          Saat ücreti = brüt aylık maaş / aylık saat böleni. FM çarpanları fazla mesai türüne göre uygulanır
          (FM1 normal gün, FM2 resmi tatil/bayram, FM3 hafta tatili). Kayıt yoksa varsayılanlar kullanılır.
        </p>

        <form onSubmit={onSaveParameters} className={`mt-4 ${FORM_SECTION}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className={FIELD_LABEL}>Yıl</span>
              <input value={paramYear} onChange={(event) => setParamYear(event.target.value)} inputMode="numeric" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Aylık Saat Böleni</span>
              <input value={paramDivisor} onChange={(event) => setParamDivisor(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>FM1 Çarpanı</span>
              <input value={paramFm1} onChange={(event) => setParamFm1(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>FM2 Çarpanı</span>
              <input value={paramFm2} onChange={(event) => setParamFm2(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>FM3 Çarpanı</span>
              <input value={paramFm3} onChange={(event) => setParamFm3(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            Yasal Kesinti Parametreleri (oranlar ondalık: %14 = 0.14)
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className={FIELD_LABEL}>SGK İşçi Oranı</span>
              <input value={paramSgkEmp} onChange={(event) => setParamSgkEmp(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>İşsizlik İşçi Oranı</span>
              <input value={paramUnempEmp} onChange={(event) => setParamUnempEmp(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>SGK İşveren Oranı</span>
              <input value={paramSgkErRate} onChange={(event) => setParamSgkErRate(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>İşsizlik İşveren Oranı</span>
              <input value={paramUnempErRate} onChange={(event) => setParamUnempErRate(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Damga Vergisi Oranı</span>
              <input value={paramStampRate} onChange={(event) => setParamStampRate(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>SGK Tabanı (TL/ay)</span>
              <input value={paramSgkBase} onChange={(event) => setParamSgkBase(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>SGK Tavanı (TL/ay)</span>
              <input value={paramSgkCeiling} onChange={(event) => setParamSgkCeiling(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Asgari Ücret Brüt (TL)</span>
              <input value={paramMinWage} onChange={(event) => setParamMinWage(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>İşveren Teşvik Oranı (5510)</span>
              <input value={paramIncentiveRate} onChange={(event) => setParamIncentiveRate(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>SGDP İşçi (Emekli)</span>
              <input value={paramSgdpEmp} onChange={(event) => setParamSgdpEmp(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>SGDP İşveren (Emekli)</span>
              <input value={paramSgdpEr} onChange={(event) => setParamSgdpEr(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label
              className={`mt-6 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                paramApplyIncentive ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={paramApplyIncentive}
                onChange={(event) => setParamApplyIncentive(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Teşvik uygula
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Gelir vergisi dilimleri 2026 varsayılanıyla gelir (190k %15 / 400k %20 / 1.5M %27 / 5.3M %35 / üstü %40).
            Asgari ücret gelir/damga istisnası otomatik hesaplanır.
          </p>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            Yarı-Yıl Asgari Ücret & Engellilik İndirimi
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className={FIELD_LABEL}>Asgari Ücret H2 (Temmuz+)</span>
              <input value={paramMinWageH2} onChange={(event) => setParamMinWageH2(event.target.value)} inputMode="decimal" placeholder="Boş = zam yok" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>H2 Başlangıç Ayı</span>
              <select value={paramH2Month} onChange={(event) => setParamH2Month(event.target.value)} className={FIELD_INPUT}>
                {MONTH_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>{String(index + 1).padStart(2, '0')} - {label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Engelli 1. Derece (TL/ay)</span>
              <input value={paramDisab1} onChange={(event) => setParamDisab1(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Engelli 2. Derece (TL/ay)</span>
              <input value={paramDisab2} onChange={(event) => setParamDisab2(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Engelli 3. Derece (TL/ay)</span>
              <input value={paramDisab3} onChange={(event) => setParamDisab3(event.target.value)} inputMode="decimal" className={FIELD_INPUT} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Kıdem Tazminatı Tavanı (TL)</span>
              <input value={paramSeverance} onChange={(event) => setParamSeverance(event.target.value)} inputMode="decimal" placeholder="0 = tavan yok" className={FIELD_INPUT} />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            H2 asgari ücret girilirse yıl ortası zammı istisna/damga hesabına yansır. Engellilik indirimi tutarları
            gelir vergisi matrahından düşülür (resmi yıllık tutarları girin); çalışan derecesi Özlük sekmesinde seçilir.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                paramDeductMissing
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={paramDeductMissing}
                onChange={(event) => setParamDeductMissing(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Eksik çalışma dakikaları hakedişten düşülsün
            </label>
            <div className="flex items-center gap-3">
              {parametersQuery.data && !parametersQuery.data.is_persisted ? (
                <span className="text-xs text-slate-500">Bu yıl için kayıt yok; varsayılanlar gösteriliyor.</span>
              ) : null}
              <button
                type="submit"
                disabled={paramsMutation.isPending}
                className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {paramsMutation.isPending ? 'Kaydediliyor...' : 'Parametreleri Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </Panel>
      ) : null}

      {settingsTab === 'company' ? (
      <Panel>
        <p className={FORM_SECTION_TITLE}>Firma Bilgileri</p>
        <h4 className="mt-2 text-base font-semibold text-slate-900">Bordro Başlığı</h4>
        <p className="mt-1 text-sm text-slate-500">Bordro çıktısının üst kısmında görünen firma/SGK bilgileri.</p>
        <div className={`mt-4 ${FORM_SECTION}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {([
              ['firma_unvan', 'Firma Ünvanı'],
              ['merkez_adres', 'Merkez Adres'],
              ['sube_adres', 'Şube Adres'],
              ['vergi_dairesi', 'Vergi Dairesi'],
              ['vergi_no', 'Vergi No'],
              ['ticaret_sicil_no', 'Ticaret Sicil No'],
              ['mersis_no', 'Mersis No'],
              ['sgk_isyeri_no', 'SGK İşyeri No'],
              ['internet_adresi', 'İnternet Adresi'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block">
                <span className={FIELD_LABEL}>{label}</span>
                <input
                  value={companyForm[key] ?? ''}
                  onChange={(event) => setCompanyForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  className={FIELD_INPUT}
                />
              </label>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className={FORM_SECTION_TITLE}>Logo Muhasebe Hesap Kodları</p>
            <p className="mt-1 text-sm text-slate-500">
              Logo mahsup fişi aktarımında kullanılan hesap kodları. Boş bırakılırsa TR varsayılan
              (770 / 335 / 360 / 361) kullanılır.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {([
                ['logo_hesap_ucret', 'Ücret Gideri (770)'],
                ['logo_hesap_sgk_isveren', 'SGK İşveren Gideri (770)'],
                ['logo_hesap_net_odenecek', 'Personele Borçlar / Net (335)'],
                ['logo_hesap_odenecek_vergi', 'Ödenecek Vergi ve Fonlar (360)'],
                ['logo_hesap_odenecek_sgk', 'Ödenecek SGK (361)'],
                ['logo_hesap_personel_kesinti', 'Personel Kesintileri / Avans (335)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className={FIELD_LABEL}>{label}</span>
                  <input
                    value={companyForm[key] ?? ''}
                    onChange={(event) => setCompanyForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    className={FIELD_INPUT}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={companyMutation.isPending}
              onClick={() => {
                const cleaned = Object.fromEntries(
                  Object.entries(companyForm).map(([k, v]) => [k, (v ?? '').toString().trim() || null]),
                ) as unknown as CompanySettingsRecord
                companyMutation.mutate(cleaned)
              }}
              className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {companyMutation.isPending ? 'Kaydediliyor...' : 'Firma Bilgilerini Kaydet'}
            </button>
          </div>
        </div>
      </Panel>
      ) : null}
    </div>
  )
}
