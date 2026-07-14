import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  bulkApplyDepartmentCompensation,
  commitPersonnelImport,
  createEmployeeCompensation,
  deleteEmployeeCompensation,
  downloadOzlukMasterXlsx,
  getDepartments,
  getOzlukEmployeeDetail,
  getOzlukMaster,
  previewPersonnelImport,
  updateEmployeeActive,
  upsertEmployeePayrollProfile,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TableSearchInput } from '../components/TableSearchInput'
import { useToast } from '../hooks/useToast'
import type { CompensationBasis, OzlukMasterRow, PersonnelImportPreviewResponse, SgkStatus } from '../types/api'

const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500'
const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700'

type DetailTab = 'kimlik' | 'sgk' | 'banka' | 'acil' | 'ucret'

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'kimlik', label: 'Kimlik & İş' },
  { key: 'sgk', label: 'SGK & Vergi' },
  { key: 'banka', label: 'Banka' },
  { key: 'acil', label: 'Acil Durum' },
  { key: 'ucret', label: 'Ücret Geçmişi' },
]

type ProfileForm = {
  sgk_status: SgkStatus
  is_part_time: boolean
  disability_degree: number
  tc_kimlik_no: string
  sgk_sicil_no: string
  ise_giris_tarihi: string
  cinsiyet: string
  meslek_grubu: string
  kanun_no: string
  sozlesme_tipi: string
  pozisyon: string
  dogum_tarihi: string
  medeni_hal: string
  acil_kisi_adi: string
  acil_kisi_tel: string
  sirket_telefonu: string
  cep_telefonu: string
  adres: string
  banka_adi: string
  sube: string
  hesap_no: string
}

const EMPTY_PROFILE: ProfileForm = {
  sgk_status: 'NORMAL',
  is_part_time: false,
  disability_degree: 0,
  tc_kimlik_no: '',
  sgk_sicil_no: '',
  ise_giris_tarihi: '',
  cinsiyet: '',
  meslek_grubu: '',
  kanun_no: '',
  sozlesme_tipi: '',
  pozisyon: '',
  dogum_tarihi: '',
  medeni_hal: '',
  acil_kisi_adi: '',
  acil_kisi_tel: '',
  sirket_telefonu: '',
  cep_telefonu: '',
  adres: '',
  banka_adi: '',
  sube: '',
  hesap_no: '',
}

function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return `${parsed.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

function orNull(value: string): string | null {
  return value.trim() || null
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

type ColumnFilterKey = 'department_name' | 'pozisyon' | 'sozlesme_tipi' | 'sgk_status_label' | 'durum'
type SortKey = 'full_name' | 'department_name' | 'pozisyon' | 'ise_giris_tarihi' | 'current_amount'

function columnValue(row: OzlukMasterRow, key: ColumnFilterKey): string {
  switch (key) {
    case 'department_name':
      return row.department_name ?? '-'
    case 'pozisyon':
      return row.pozisyon ?? '-'
    case 'sozlesme_tipi':
      return row.sozlesme_tipi === 'BELIRLI' ? 'Belirli Süreli' : row.sozlesme_tipi === 'BELIRSIZ' ? 'Belirsiz Süreli' : '-'
    case 'sgk_status_label':
      return row.sgk_status === 'EMEKLI' ? 'Emekli' : 'Normal'
    case 'durum':
      return row.is_active ? 'Aktif' : 'Pasif'
  }
}

function ColumnFilterDropdown({
  label,
  options,
  excluded,
  onChange,
}: {
  label: string
  options: string[]
  excluded: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const active = excluded.size > 0

  const toggleValue = (value: string) => {
    const next = new Set(excluded)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative inline-block normal-case">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
          active ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'
        }`}
        title={`${label} filtrele`}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
          <path d="M0 1h12L7.5 6.5v3.8L4.5 12V6.5z" />
        </svg>
      </button>
      {open ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="absolute left-0 top-6 z-20 max-h-64 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-left text-slate-700 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            Tümünü Seç
          </button>
          {options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
              <input
                type="checkbox"
                checked={!excluded.has(option)}
                onChange={() => toggleValue(option)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <span className="truncate">{option || '(Boş)'}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RowActionsMenu({
  isActive,
  onOpenDetail,
  onOpenTab,
  onToggleActive,
  toggleActivePending,
}: {
  isActive: boolean
  onOpenDetail: () => void
  onOpenTab: (tab: DetailTab) => void
  onToggleActive: () => void
  toggleActivePending: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const runAndClose = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block text-left" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        İşlemler ▾
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg">
          <button
            type="button"
            onClick={() => runAndClose(onOpenDetail)}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
          >
            Detayı Aç
          </button>
          <button
            type="button"
            onClick={() => runAndClose(() => onOpenTab('ucret'))}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
          >
            Ücret Geçmişi
          </button>
          <button
            type="button"
            onClick={() => runAndClose(() => onOpenTab('sgk'))}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
          >
            SGK &amp; Vergi
          </button>
          <button
            type="button"
            disabled={toggleActivePending}
            onClick={() => runAndClose(onToggleActive)}
            className={`block w-full px-3 py-1.5 text-left disabled:opacity-60 ${
              isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {isActive ? 'Arşivle' : 'Arşivden Çıkar'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function OzlukPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()

  const [search, setSearch] = useState('')
  const [departmentFilterId, setDepartmentFilterId] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [colExcluded, setColExcluded] = useState<Record<ColumnFilterKey, Set<string>>>(() => ({
    department_name: new Set(),
    pozisyon: new Set(),
    sozlesme_tipi: new Set(),
    sgk_status_label: new Set(),
    durum: new Set(),
  }))
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'full_name', dir: 'asc' })

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('kimlik')
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE)
  const [profileLoadedFor, setProfileLoadedFor] = useState<number | null>(null)

  const [compBasis, setCompBasis] = useState<CompensationBasis>('GROSS')
  const [compGross, setCompGross] = useState('')
  const [compNet, setCompNet] = useState('')
  const [compEffectiveFrom, setCompEffectiveFrom] = useState('')
  const [compNote, setCompNote] = useState('')

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDeptId, setBulkDeptId] = useState('')
  const [bulkBasis, setBulkBasis] = useState<CompensationBasis>('GROSS')
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkEffective, setBulkEffective] = useState('')
  const [bulkInactive, setBulkInactive] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<PersonnelImportPreviewResponse | null>(null)
  const [importSkipped, setImportSkipped] = useState<Set<number>>(new Set())

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: getDepartments })

  const masterQuery = useQuery({
    queryKey: ['ozluk-master', departmentFilterId, statusFilter, search],
    queryFn: () =>
      getOzlukMaster({
        department_id: departmentFilterId ? Number(departmentFilterId) : undefined,
        status: statusFilter,
        search: search.trim() || undefined,
      }),
  })

  const detailQuery = useQuery({
    queryKey: ['ozluk-detail', selectedEmployeeId],
    queryFn: () => getOzlukEmployeeDetail(selectedEmployeeId as number),
    enabled: selectedEmployeeId !== null,
  })

  if (detailQuery.data && profileLoadedFor !== selectedEmployeeId) {
    setProfileLoadedFor(selectedEmployeeId)
    const p = detailQuery.data.profile
    setProfileForm({
      sgk_status: p.sgk_status,
      is_part_time: p.is_part_time,
      disability_degree: p.disability_degree ?? 0,
      tc_kimlik_no: p.tc_kimlik_no ?? '',
      sgk_sicil_no: p.sgk_sicil_no ?? '',
      ise_giris_tarihi: p.ise_giris_tarihi ?? '',
      cinsiyet: p.cinsiyet ?? '',
      meslek_grubu: p.meslek_grubu ?? '',
      kanun_no: p.kanun_no ?? '',
      sozlesme_tipi: p.sozlesme_tipi ?? '',
      pozisyon: p.pozisyon ?? '',
      dogum_tarihi: p.dogum_tarihi ?? '',
      medeni_hal: p.medeni_hal ?? '',
      acil_kisi_adi: p.acil_kisi_adi ?? '',
      acil_kisi_tel: p.acil_kisi_tel ?? '',
      sirket_telefonu: p.sirket_telefonu ?? '',
      cep_telefonu: p.cep_telefonu ?? '',
      adres: p.adres ?? '',
      banka_adi: p.banka_adi ?? '',
      sube: p.sube ?? '',
      hesap_no: p.hesap_no ?? '',
    })
  }

  const invalidateOzluk = () => {
    void queryClient.invalidateQueries({ queryKey: ['ozluk-master'] })
    void queryClient.invalidateQueries({ queryKey: ['ozluk-detail', selectedEmployeeId] })
    void queryClient.invalidateQueries({ queryKey: ['employees'] })
  }

  const toggleActiveMutation = useMutation({
    mutationFn: ({ employeeId, nextStatus }: { employeeId: number; nextStatus: boolean }) =>
      updateEmployeeActive(employeeId, { is_active: nextStatus }),
    onSuccess: (employee) => {
      invalidateOzluk()
      pushToast({
        variant: 'success',
        title: employee.is_active ? 'Çalışan arşivden çıkarıldı' : 'Çalışan arşivlendi',
        description: `${employee.full_name} için durum güncellendi.`,
      })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'İşlem başarısız',
        description: parseApiError(error, 'Çalışan durumu güncellenemedi.').message,
      })
    },
  })

  const exportXlsxMutation = useMutation({
    mutationFn: () =>
      downloadOzlukMasterXlsx({
        department_id: departmentFilterId ? Number(departmentFilterId) : undefined,
        status: statusFilter,
        search: search.trim() || undefined,
      }),
    onSuccess: (result) => {
      triggerBlobDownload(result.blob, result.file_name || `ozluk_${new Date().toISOString().slice(0, 10)}.xlsx`)
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'İndirme başarısız',
        description: parseApiError(error, 'Özlük Excel dosyası indirilemedi.').message,
      })
    },
  })

  const saveProfileMutation = useMutation({
    mutationFn: () => {
      if (selectedEmployeeId === null) throw new Error('no employee selected')
      return upsertEmployeePayrollProfile(selectedEmployeeId, {
        sgk_status: profileForm.sgk_status,
        is_part_time: profileForm.is_part_time,
        disability_degree: profileForm.disability_degree,
        tc_kimlik_no: orNull(profileForm.tc_kimlik_no),
        sgk_sicil_no: orNull(profileForm.sgk_sicil_no),
        ise_giris_tarihi: orNull(profileForm.ise_giris_tarihi),
        cinsiyet: orNull(profileForm.cinsiyet),
        meslek_grubu: orNull(profileForm.meslek_grubu),
        kanun_no: orNull(profileForm.kanun_no),
        sozlesme_tipi: orNull(profileForm.sozlesme_tipi),
        pozisyon: orNull(profileForm.pozisyon),
        dogum_tarihi: orNull(profileForm.dogum_tarihi),
        medeni_hal: orNull(profileForm.medeni_hal),
        acil_kisi_adi: orNull(profileForm.acil_kisi_adi),
        acil_kisi_tel: orNull(profileForm.acil_kisi_tel),
        sirket_telefonu: orNull(profileForm.sirket_telefonu),
        cep_telefonu: orNull(profileForm.cep_telefonu),
        adres: orNull(profileForm.adres),
        banka_adi: orNull(profileForm.banka_adi),
        sube: orNull(profileForm.sube),
        hesap_no: orNull(profileForm.hesap_no),
      })
    },
    onSuccess: () => {
      invalidateOzluk()
      pushToast({ variant: 'success', title: 'Özlük bilgileri kaydedildi', description: 'Kayıt güncellendi.' })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Kayıt başarısız',
        description: parseApiError(error, 'Özlük bilgileri kaydedilemedi.').message,
      })
    },
  })

  const createCompMutation = useMutation({
    mutationFn: createEmployeeCompensation,
    onSuccess: () => {
      setCompGross('')
      setCompNet('')
      setCompNote('')
      setCompEffectiveFrom('')
      invalidateOzluk()
      pushToast({ variant: 'success', title: 'Ücret kaydı eklendi', description: 'Yeni ücret geçerlilik tarihinden itibaren uygulanır.' })
    },
    onError: (error) => {
      pushToast({ variant: 'error', title: 'Kayıt başarısız', description: parseApiError(error, 'Ücret kaydı eklenemedi.').message })
    },
  })

  const deleteCompMutation = useMutation({
    mutationFn: deleteEmployeeCompensation,
    onSuccess: () => {
      invalidateOzluk()
      pushToast({ variant: 'success', title: 'Ücret kaydı silindi' })
    },
    onError: (error) => {
      pushToast({ variant: 'error', title: 'Silme başarısız', description: parseApiError(error, 'Ücret kaydı silinemedi.').message })
    },
  })

  const bulkCompMutation = useMutation({
    mutationFn: bulkApplyDepartmentCompensation,
    onSuccess: (res) => {
      setBulkAmount('')
      void queryClient.invalidateQueries({ queryKey: ['ozluk-master'] })
      pushToast({
        variant: 'success',
        title: 'Toplu ücret uygulandı',
        description: `${res.total} çalışan: ${res.created} yeni, ${res.updated} güncellendi.`,
      })
      setBulkOpen(false)
    },
    onError: (error) => {
      pushToast({ variant: 'error', title: 'İşlem başarısız', description: parseApiError(error, 'Toplu ücret uygulanamadı.').message })
    },
  })

  const importPreviewMutation = useMutation({
    mutationFn: (file: File) => previewPersonnelImport(file),
    onSuccess: (data) => {
      setImportPreview(data)
      setImportSkipped(new Set())
      if (data.parse_errors.length > 0) {
        pushToast({ variant: 'error', title: 'Bazı satırlar okunamadı', description: data.parse_errors.slice(0, 3).join(' ') })
      }
    },
    onError: (error) => {
      pushToast({ variant: 'error', title: 'Önizleme başarısız', description: parseApiError(error, 'Dosya işlenemedi.').message })
    },
  })

  const importCommitMutation = useMutation({
    mutationFn: () => {
      if (!importFile) throw new Error('no file')
      return commitPersonnelImport(importFile, Array.from(importSkipped))
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['ozluk-master'] })
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
      pushToast({
        variant: 'success',
        title: 'İçe aktarma tamamlandı',
        description: `${res.created} yeni, ${res.updated} güncellendi, ${res.skipped} atlandı.${
          res.created_regions.length ? ` Yeni bölge: ${res.created_regions.join(', ')}.` : ''
        }${res.created_departments.length ? ` Yeni departman: ${res.created_departments.join(', ')}.` : ''}`,
      })
      setImportOpen(false)
      setImportFile(null)
      setImportPreview(null)
    },
    onError: (error) => {
      pushToast({ variant: 'error', title: 'İçe aktarma başarısız', description: parseApiError(error, 'İşlem tamamlanamadı.').message })
    },
  })

  const toggleImportSkip = (siraNo: number) => {
    setImportSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(siraNo)) next.delete(siraNo)
      else next.add(siraNo)
      return next
    })
  }

  const rows: OzlukMasterRow[] = useMemo(() => masterQuery.data ?? [], [masterQuery.data])

  const setColExcludedFor = (key: ColumnFilterKey, next: Set<string>) =>
    setColExcluded((prev) => ({ ...prev, [key]: next }))

  const columnOptions = useMemo(() => {
    const keys: ColumnFilterKey[] = ['department_name', 'pozisyon', 'sozlesme_tipi', 'sgk_status_label', 'durum']
    const result = {} as Record<ColumnFilterKey, string[]>
    for (const key of keys) {
      result[key] = Array.from(new Set(rows.map((row) => columnValue(row, key)))).sort((a, b) => a.localeCompare(b, 'tr'))
    }
    return result
  }, [rows])

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (colExcluded.department_name.has(columnValue(row, 'department_name'))) return false
      if (colExcluded.pozisyon.has(columnValue(row, 'pozisyon'))) return false
      if (colExcluded.sozlesme_tipi.has(columnValue(row, 'sozlesme_tipi'))) return false
      if (colExcluded.sgk_status_label.has(columnValue(row, 'sgk_status_label'))) return false
      if (colExcluded.durum.has(columnValue(row, 'durum'))) return false
      return true
    })

    const dirMul = sort.dir === 'asc' ? 1 : -1
    const amountOf = (row: OzlukMasterRow) =>
      Number(row.current_basis === 'NET' ? row.current_net_monthly : row.current_gross_monthly) || 0

    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'full_name':
          return a.full_name.localeCompare(b.full_name, 'tr') * dirMul
        case 'department_name':
          return (a.department_name ?? '').localeCompare(b.department_name ?? '', 'tr') * dirMul
        case 'pozisyon':
          return (a.pozisyon ?? '').localeCompare(b.pozisyon ?? '', 'tr') * dirMul
        case 'ise_giris_tarihi':
          return (a.ise_giris_tarihi ?? '').localeCompare(b.ise_giris_tarihi ?? '') * dirMul
        case 'current_amount':
          return (amountOf(a) - amountOf(b)) * dirMul
        default:
          return 0
      }
    })
  }, [rows, colExcluded, sort])

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const clearColumnFilters = () =>
    setColExcluded({
      department_name: new Set(),
      pozisyon: new Set(),
      sozlesme_tipi: new Set(),
      sgk_status_label: new Set(),
      durum: new Set(),
    })

  const activeFilterCount = Object.values(colExcluded).filter((s) => s.size > 0).length

  const sortHeader = ({ label, sortKey, align }: { label: string; sortKey: SortKey; align?: 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className={`inline-flex items-center gap-1 hover:text-slate-700 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {label}
      <span className="text-[9px]">{sort.key === sortKey ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )

  const selectedRow = useMemo(
    () => (masterQuery.data ?? []).find((r) => r.employee_id === selectedEmployeeId) ?? null,
    [masterQuery.data, selectedEmployeeId],
  )

  const openDetail = (employeeId: number) => {
    setSelectedEmployeeId(employeeId)
    setDetailTab('kimlik')
  }

  const openDetailWithTab = (employeeId: number, tab: DetailTab) => {
    setSelectedEmployeeId(employeeId)
    setDetailTab(tab)
  }

  const closeDetail = () => {
    setSelectedEmployeeId(null)
    setProfileLoadedFor(null)
  }

  const onSubmitComp = (event: FormEvent) => {
    event.preventDefault()
    if (selectedEmployeeId === null) return
    if (!compEffectiveFrom) {
      pushToast({ variant: 'error', title: 'Tarih gerekli', description: 'Geçerlilik tarihi seçin.' })
      return
    }
    const amountRaw = (compBasis === 'NET' ? compNet : compGross).trim().replace(',', '.')
    if (!amountRaw || !Number.isFinite(Number(amountRaw)) || Number(amountRaw) <= 0) {
      pushToast({ variant: 'error', title: 'Geçersiz tutar', description: 'Tutar pozitif sayı olmalı.' })
      return
    }
    createCompMutation.mutate({
      employee_id: selectedEmployeeId,
      basis: compBasis,
      gross_monthly: compBasis === 'GROSS' ? amountRaw : undefined,
      net_monthly: compBasis === 'NET' ? amountRaw : undefined,
      effective_from: compEffectiveFrom,
      note: orNull(compNote) ?? undefined,
    })
  }

  const text = (key: keyof ProfileForm, label: string, type = 'text') => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        value={profileForm[key] as string}
        onChange={(event) => setProfileForm((prev) => ({ ...prev, [key]: event.target.value }))}
        className={INPUT}
      />
    </label>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Özlük Yönetimi"
        action={
          <>
            <button
              type="button"
              disabled={exportXlsxMutation.isPending}
              onClick={() => exportXlsxMutation.mutate()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exportXlsxMutation.isPending ? 'İndiriliyor...' : "Excel'e Aktar"}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Excel'den İçe Aktar
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
            >
              Departmana Toplu Ücret Uygula
            </button>
          </>
        }
      />
      <p className="-mt-3 max-w-3xl text-sm text-slate-500">
        Her çalışanın kimlik, sözleşme, SGK, banka ve ücret geçmişi TEK ana kayıttan yönetilir.
        Bordro modülü bu kayıttan besleniyor; ücret değişikliği burada girilir, hesaplamaya
        geçerlilik tarihinden itibaren yansır.
      </p>

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TableSearchInput value={search} onChange={setSearch} placeholder="Ada göre ara..." />
          <label className="block text-sm text-slate-700">
            Departman
            <select
              value={departmentFilterId}
              onChange={(event) => setDepartmentFilterId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-200 focus:border-brand-500 focus:ring"
            >
              <option value="">Tümü</option>
              {(departmentsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            Durum
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-200 focus:border-brand-500 focus:ring"
            >
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
              <option value="all">Tümü</option>
            </select>
          </label>
        </div>

        {masterQuery.isLoading ? <LoadingBlock /> : null}
        {masterQuery.isError ? <ErrorBlock message="Özlük listesi alınamadı." /> : null}
        {!masterQuery.isLoading && !masterQuery.isError ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                {visibleRows.length} / {rows.length} kayıt gösteriliyor
              </span>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearColumnFilters}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Sütun Filtrelerini Temizle ({activeFilterCount})
                </button>
              ) : null}
            </div>
            <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]">
                  <tr>
                    <th className="whitespace-nowrap py-2 pl-3">
                      {sortHeader({ label: 'Ad Soyad', sortKey: 'full_name' })}
                    </th>
                    <th className="whitespace-nowrap py-2">
                      <span className="inline-flex items-center">
                        {sortHeader({ label: 'Departman', sortKey: 'department_name' })}
                        <ColumnFilterDropdown
                          label="Departman"
                          options={columnOptions.department_name}
                          excluded={colExcluded.department_name}
                          onChange={(next) => setColExcludedFor('department_name', next)}
                        />
                      </span>
                    </th>
                    <th className="whitespace-nowrap py-2">
                      <span className="inline-flex items-center">
                        {sortHeader({ label: 'Pozisyon', sortKey: 'pozisyon' })}
                        <ColumnFilterDropdown
                          label="Pozisyon"
                          options={columnOptions.pozisyon}
                          excluded={colExcluded.pozisyon}
                          onChange={(next) => setColExcludedFor('pozisyon', next)}
                        />
                      </span>
                    </th>
                    <th className="whitespace-nowrap py-2">Telefon</th>
                    <th className="whitespace-nowrap py-2">
                      <span className="inline-flex items-center">
                        Sözleşme
                        <ColumnFilterDropdown
                          label="Sözleşme"
                          options={columnOptions.sozlesme_tipi}
                          excluded={colExcluded.sozlesme_tipi}
                          onChange={(next) => setColExcludedFor('sozlesme_tipi', next)}
                        />
                      </span>
                    </th>
                    <th className="whitespace-nowrap py-2">
                      {sortHeader({ label: 'İşe Giriş', sortKey: 'ise_giris_tarihi' })}
                    </th>
                    <th className="whitespace-nowrap py-2">
                      <span className="inline-flex items-center">
                        SGK
                        <ColumnFilterDropdown
                          label="SGK"
                          options={columnOptions.sgk_status_label}
                          excluded={colExcluded.sgk_status_label}
                          onChange={(next) => setColExcludedFor('sgk_status_label', next)}
                        />
                      </span>
                    </th>
                    <th className="whitespace-nowrap py-2 text-right">
                      {sortHeader({ label: 'Güncel Ücret', sortKey: 'current_amount', align: 'right' })}
                    </th>
                    <th className="whitespace-nowrap py-2 pr-3 text-right">
                      <span className="inline-flex items-center justify-end">
                        Kayıt
                        <ColumnFilterDropdown
                          label="Durum"
                          options={columnOptions.durum}
                          excluded={colExcluded.durum}
                          onChange={(next) => setColExcludedFor('durum', next)}
                        />
                      </span>
                    </th>
                    <th className="whitespace-nowrap py-2 pr-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr
                      key={row.employee_id}
                      onClick={() => openDetail(row.employee_id)}
                      className={`cursor-pointer border-t border-slate-100 transition hover:bg-sky-50/60 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="py-2 pl-3 font-medium text-slate-800">
                        {row.full_name}
                        {!row.is_active ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">PASİF</span>
                        ) : null}
                      </td>
                      <td className="py-2 text-slate-600">{row.department_name ?? '-'}</td>
                      <td className="py-2 text-slate-600">{row.pozisyon ?? '-'}</td>
                      <td className="py-2 text-slate-600">{row.cep_telefonu ?? row.sirket_telefonu ?? '-'}</td>
                      <td className="py-2 text-slate-600">
                        {row.sozlesme_tipi === 'BELIRLI' ? 'Belirli Süreli' : row.sozlesme_tipi === 'BELIRSIZ' ? 'Belirsiz Süreli' : '-'}
                      </td>
                      <td className="py-2 text-slate-600">{row.ise_giris_tarihi ?? '-'}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            row.sgk_status === 'EMEKLI' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.sgk_status === 'EMEKLI' ? 'Emekli' : 'Normal'}
                        </span>
                        {row.is_part_time ? <span className="ml-1 text-[10px] text-slate-400">yarı zamanlı</span> : null}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {row.current_gross_monthly ? formatMoney(row.current_basis === 'NET' ? row.current_net_monthly : row.current_gross_monthly) : '-'}
                      </td>
                      <td className="py-2 text-right">
                        {row.has_profile ? (
                          <span className="text-[11px] font-semibold text-emerald-600">Tam</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-600">Eksik</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <RowActionsMenu
                          isActive={row.is_active}
                          onOpenDetail={() => openDetail(row.employee_id)}
                          onOpenTab={(tab) => openDetailWithTab(row.employee_id, tab)}
                          onToggleActive={() =>
                            toggleActiveMutation.mutate({ employeeId: row.employee_id, nextStatus: !row.is_active })
                          }
                          toggleActivePending={
                            toggleActiveMutation.isPending && toggleActiveMutation.variables?.employeeId === row.employee_id
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-sm text-slate-400">
                        {rows.length === 0 ? 'Kayıt bulunamadı.' : 'Filtreye uyan kayıt yok.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Panel>

      <Modal
        open={selectedEmployeeId !== null}
        onClose={closeDetail}
        title={selectedRow?.full_name ?? detailQuery.data?.full_name ?? 'Özlük Kaydı'}
        placement="right"
        maxWidthClass="max-w-2xl"
      >
        {detailQuery.isLoading ? <LoadingBlock /> : null}
        {detailQuery.isError ? <ErrorBlock message="Özlük kaydı alınamadı." /> : null}
        {detailQuery.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailTab(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    detailTab === tab.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'kimlik' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {text('pozisyon', 'Pozisyon / Ünvan')}
                <label className="block">
                  <span className={LABEL}>Sözleşme Tipi</span>
                  <select
                    value={profileForm.sozlesme_tipi}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, sozlesme_tipi: event.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Seçiniz</option>
                    <option value="BELIRSIZ">Belirsiz Süreli</option>
                    <option value="BELIRLI">Belirli Süreli</option>
                  </select>
                </label>
                {text('ise_giris_tarihi', 'İşe Giriş Tarihi', 'date')}
                {text('dogum_tarihi', 'Doğum Tarihi', 'date')}
                <label className="block">
                  <span className={LABEL}>Cinsiyet</span>
                  <select
                    value={profileForm.cinsiyet}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, cinsiyet: event.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Seçiniz</option>
                    <option value="K">Kadın</option>
                    <option value="E">Erkek</option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>Medeni Hal</span>
                  <select
                    value={profileForm.medeni_hal}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, medeni_hal: event.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Seçiniz</option>
                    <option value="BEKAR">Bekar</option>
                    <option value="EVLI">Evli</option>
                  </select>
                </label>
                {text('meslek_grubu', 'Meslek Grubu')}
                {text('kanun_no', 'Kanun No (örn 05510)')}
                {text('sirket_telefonu', 'İş Telefonu', 'tel')}
                {text('cep_telefonu', 'Cep Telefonu', 'tel')}
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Adres</span>
                  <textarea
                    value={profileForm.adres}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, adres: event.target.value }))}
                    rows={2}
                    className={INPUT}
                  />
                </label>
              </div>
            ) : null}

            {detailTab === 'sgk' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>SGK Statüsü</span>
                  <select
                    value={profileForm.sgk_status}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, sgk_status: event.target.value as SgkStatus }))}
                    className={INPUT}
                  >
                    <option value="NORMAL">Normal (4a)</option>
                    <option value="EMEKLI">Emekli (SGDP)</option>
                  </select>
                </label>
                <label
                  className={`mt-6 flex h-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    profileForm.is_part_time ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={profileForm.is_part_time}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, is_part_time: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Kısmi süreli (part-time)
                </label>
                {text('tc_kimlik_no', 'TC Kimlik No')}
                {text('sgk_sicil_no', 'SGK Sicil No')}
                <label className="block">
                  <span className={LABEL}>Engellilik Derecesi (0-3)</span>
                  <select
                    value={profileForm.disability_degree}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, disability_degree: Number(event.target.value) }))}
                    className={INPUT}
                  >
                    <option value={0}>Yok</option>
                    <option value={1}>1. Derece</option>
                    <option value={2}>2. Derece</option>
                    <option value={3}>3. Derece</option>
                  </select>
                </label>
              </div>
            ) : null}

            {detailTab === 'banka' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {text('banka_adi', 'Banka')}
                {text('sube', 'Şube')}
                {text('hesap_no', 'Hesap No / IBAN')}
              </div>
            ) : null}

            {detailTab === 'acil' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {text('acil_kisi_adi', 'Acil Durum Kişisi Ad Soyad')}
                {text('acil_kisi_tel', 'Acil Durum Telefon')}
              </div>
            ) : null}

            {detailTab === 'ucret' ? (
              <div className="space-y-3">
                <form onSubmit={onSubmitComp} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className={SECTION_TITLE}>Yeni Ücret Kaydı</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={LABEL}>Ücret Tabanı</span>
                      <select
                        value={compBasis}
                        onChange={(event) => setCompBasis(event.target.value as CompensationBasis)}
                        className={INPUT}
                      >
                        <option value="GROSS">Brütten (brüt belli)</option>
                        <option value="NET">Netten (net garantili)</option>
                      </select>
                    </label>
                    {compBasis === 'NET' ? (
                      <label className="block">
                        <span className={LABEL}>Net Aylık (TL)</span>
                        <input value={compNet} onChange={(event) => setCompNet(event.target.value)} inputMode="decimal" className={INPUT} />
                      </label>
                    ) : (
                      <label className="block">
                        <span className={LABEL}>Brüt Aylık (TL)</span>
                        <input value={compGross} onChange={(event) => setCompGross(event.target.value)} inputMode="decimal" className={INPUT} />
                      </label>
                    )}
                    <label className="block">
                      <span className={LABEL}>Geçerlilik Başlangıcı</span>
                      <input type="date" value={compEffectiveFrom} onChange={(event) => setCompEffectiveFrom(event.target.value)} className={INPUT} />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Not</span>
                      <input value={compNote} onChange={(event) => setCompNote(event.target.value)} placeholder="Opsiyonel" className={INPUT} />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={createCompMutation.isPending}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {createCompMutation.isPending ? 'Kaydediliyor...' : 'Ekle'}
                    </button>
                  </div>
                </form>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2">Taban</th>
                        <th className="py-2">Tutar</th>
                        <th className="py-2">Geçerlilik</th>
                        <th className="py-2">Not</th>
                        <th className="py-2 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.compensations.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.basis === 'NET' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                              {item.basis === 'NET' ? 'NET' : 'BRÜT'}
                            </span>
                          </td>
                          <td className="py-2 font-medium">{formatMoney(item.basis === 'NET' ? item.net_monthly : item.gross_monthly)}</td>
                          <td className="py-2">{item.effective_from}</td>
                          <td className="py-2 text-slate-600">{item.note || '-'}</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              disabled={deleteCompMutation.isPending}
                              onClick={() => deleteCompMutation.mutate(item.id)}
                              className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      ))}
                      {detailQuery.data.compensations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-sm text-slate-400">Ücret kaydı yok.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {detailTab !== 'ucret' ? (
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saveProfileMutation.isPending}
                  onClick={() => saveProfileMutation.mutate()}
                  className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saveProfileMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Departmana Toplu Ücret Uygula" maxWidthClass="max-w-lg">
        <p className="text-sm text-slate-500">
          Seçilen departmandaki tüm çalışanlara aynı ücreti yazar. Aynı geçerlilik tarihinde kayıt varsa günceller.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className={LABEL}>Departman</span>
            <select value={bulkDeptId} onChange={(event) => setBulkDeptId(event.target.value)} className={INPUT}>
              <option value="">Seçiniz</option>
              {(departmentsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Ücret Tabanı</span>
            <select value={bulkBasis} onChange={(event) => setBulkBasis(event.target.value as CompensationBasis)} className={INPUT}>
              <option value="GROSS">Brütten</option>
              <option value="NET">Netten</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>{bulkBasis === 'NET' ? 'Net' : 'Brüt'} Aylık (TL)</span>
            <input value={bulkAmount} onChange={(event) => setBulkAmount(event.target.value)} inputMode="decimal" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Geçerlilik Başlangıcı</span>
            <input type="date" value={bulkEffective} onChange={(event) => setBulkEffective(event.target.value)} className={INPUT} />
          </label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${bulkInactive ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>
            <input type="checkbox" checked={bulkInactive} onChange={(event) => setBulkInactive(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Pasifler dahil
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={bulkCompMutation.isPending}
            onClick={() => {
              const deptId = Number(bulkDeptId)
              const amountRaw = bulkAmount.trim().replace(',', '.')
              if (!Number.isInteger(deptId) || deptId <= 0) {
                pushToast({ variant: 'error', title: 'Departman seçin', description: 'Toplu uygulama için departman zorunlu.' })
                return
              }
              if (!amountRaw || !Number.isFinite(Number(amountRaw)) || Number(amountRaw) <= 0) {
                pushToast({ variant: 'error', title: 'Geçersiz tutar', description: 'Tutar pozitif sayı olmalı.' })
                return
              }
              if (!bulkEffective) {
                pushToast({ variant: 'error', title: 'Tarih gerekli', description: 'Geçerlilik tarihi seçin.' })
                return
              }
              bulkCompMutation.mutate({
                department_id: deptId,
                basis: bulkBasis,
                gross_monthly: bulkBasis === 'GROSS' ? amountRaw : undefined,
                net_monthly: bulkBasis === 'NET' ? amountRaw : undefined,
                effective_from: bulkEffective,
                include_inactive: bulkInactive,
              })
            }}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {bulkCompMutation.isPending ? 'Uygulanıyor...' : 'Uygula'}
          </button>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false)
          setImportFile(null)
          setImportPreview(null)
        }}
        title="Excel'den Özlük İçe Aktar"
        maxWidthClass="max-w-4xl"
      >
        <p className="text-sm text-slate-500">
          .xlsx dosyası yükle, sistemin nasıl işleyeceğini önce burada gör (yeni bölge/departman,
          kimin oluşturulacağı, kimin güncelleneceği). Onaylamadan hiçbir kayıt yazılmaz.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              setImportFile(file)
              setImportPreview(null)
            }}
            className="text-sm"
          />
          <button
            type="button"
            disabled={!importFile || importPreviewMutation.isPending}
            onClick={() => importFile && importPreviewMutation.mutate(importFile)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {importPreviewMutation.isPending ? 'Okunuyor...' : 'Önizle'}
          </button>
        </div>

        {importPreview ? (
          <div className="mt-4 space-y-3">
            {importPreview.parse_errors.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {importPreview.parse_errors.map((err, i) => <p key={i}>{err}</p>)}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-800">Yeni oluşacak bölgeler ({importPreview.new_regions.length})</p>
                <p className="mt-1 text-amber-700">{importPreview.new_regions.join(', ') || 'Yok'}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-800">Yeni oluşacak departmanlar ({importPreview.new_departments.length})</p>
                <p className="mt-1 text-amber-700">{importPreview.new_departments.join(', ') || 'Yok'}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              {importPreview.rows.length} satır: {importPreview.rows.filter((r) => r.action === 'CREATE').length} yeni çalışan,{' '}
              {importPreview.rows.filter((r) => r.action === 'UPDATE').length} güncellenecek.
              İşaretini kaldırdığın satırlar aktarılmaz.
            </p>

            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pl-3">Dahil</th>
                    <th className="py-2">Ad Soyad</th>
                    <th className="py-2">Bölge</th>
                    <th className="py-2">Departman</th>
                    <th className="py-2">Pozisyon</th>
                    <th className="py-2">Aksiyon</th>
                    <th className="py-2">Not</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((row) => (
                    <tr key={row.sira_no} className="border-t border-slate-100">
                      <td className="py-1.5 pl-3">
                        <input
                          type="checkbox"
                          checked={!importSkipped.has(row.sira_no)}
                          onChange={() => toggleImportSkip(row.sira_no)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="py-1.5 font-medium text-slate-800">{row.full_name}</td>
                      <td className="py-1.5 text-slate-600">{row.region_name}</td>
                      <td className="py-1.5 text-slate-600">{row.department_name}</td>
                      <td className="py-1.5 text-slate-600">{row.pozisyon ?? '-'}</td>
                      <td className="py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            row.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {row.action === 'CREATE' ? 'Yeni' : 'Güncelle'}
                        </span>
                      </td>
                      <td className="py-1.5 text-[12px] text-amber-700">{row.warnings.join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={importCommitMutation.isPending}
                onClick={() => importCommitMutation.mutate()}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {importCommitMutation.isPending
                  ? 'Aktarılıyor...'
                  : `${importPreview.rows.length - importSkipped.size} Kaydı İçe Aktar`}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
