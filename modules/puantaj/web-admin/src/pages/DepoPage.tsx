import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getDepoCalisanIzinler,
  getDepoKullanicilar,
  getEmployees,
  updateDepoCalisanIzin,
  updateDepoKullaniciEmployee,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { Button } from '../components/Button'
import { EmployeeAutocompleteField } from '../components/EmployeeAutocompleteField'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

export function DepoPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('depo', 'write')

  const kullanicilarQuery = useQuery({
    queryKey: ['depo-kullanicilar'],
    queryFn: getDepoKullanicilar,
  })
  const izinlerQuery = useQuery({
    queryKey: ['depo-calisan-izinler'],
    queryFn: getDepoCalisanIzinler,
  })
  const employeesQuery = useQuery({
    queryKey: ['employees', 'active-for-depo'],
    queryFn: () => getEmployees({ status: 'active' }),
  })

  const bindMutation = useMutation({
    mutationFn: ({ id, employeeId }: { id: number; employeeId: number | null }) =>
      updateDepoKullaniciEmployee(id, { employee_id: employeeId }),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Depo kullanıcısı güncellendi' })
      void queryClient.invalidateQueries({ queryKey: ['depo-kullanicilar'] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Güncelleme başarısız',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const izinMutation = useMutation({
    mutationFn: ({ employeeId, izinli }: { employeeId: number; izinli: boolean }) =>
      updateDepoCalisanIzin(employeeId, { izinli }),
    onSuccess: (updated) => {
      pushToast({
        variant: 'success',
        title: updated.depo_stok_izni ? 'İzin verildi' : 'İzin kaldırıldı',
        description: `${updated.ad_soyad} için depo görüntüleme izni güncellendi.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['depo-calisan-izinler'] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'İzin güncellenemedi',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const kullanicilar = kullanicilarQuery.data ?? []
  const izinler = izinlerQuery.data ?? []
  const employees = employeesQuery.data ?? []

  if (kullanicilarQuery.isLoading || izinlerQuery.isLoading || employeesQuery.isLoading) {
    return <LoadingBlock />
  }

  if (kullanicilarQuery.isError) {
    return <ErrorBlock message={parseApiError(kullanicilarQuery.error, 'Depo kullanıcıları alınamadı.').message} />
  }
  if (izinlerQuery.isError) {
    return <ErrorBlock message={parseApiError(izinlerQuery.error, 'Çalışan izinleri alınamadı.').message} />
  }
  if (employeesQuery.isError) {
    return <ErrorBlock message={parseApiError(employeesQuery.error, 'Çalışan listesi alınamadı.').message} />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Depo"
        description="Depo uygulaması kullanıcı eşleştirmesi ve çalışan stok görüntüleme izinleri."
        action={
          <Button
            variant="primary"
            onClick={() => window.open('/depo', '_blank', 'noopener,noreferrer')}
          >
            Depo Uygulamasını Aç ↗
          </Button>
        }
      />

      <Panel>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Çalışan izinleri</h3>
        <p className="mb-3 text-xs text-slate-500">
          Portalda "Depo" modülünü görebilecek çalışanları belirleyin.
        </p>
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Çalışan</th>
                <th className="px-2 py-2">Depo Stok İzni</th>
                <th className="px-2 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {izinler.map((row) => (
                <tr key={row.employee_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-2 py-2 font-medium text-slate-900">
                    #{row.employee_id} - {row.ad_soyad}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge value={row.depo_stok_izni ? 'Aktif' : 'Pasif'} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={!canWrite || izinMutation.isPending}
                      onClick={() =>
                        izinMutation.mutate({ employeeId: row.employee_id, izinli: !row.depo_stok_izni })
                      }
                      className={`rounded-lg px-3 py-1 text-xs font-semibold text-white ${
                        row.depo_stok_izni ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {row.depo_stok_izni ? 'İzni Kaldır' : 'İzin Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {izinler.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aktif çalışan bulunamadı.</p>
        ) : null}
      </Panel>

      <Panel>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Depo kullanıcıları</h3>
        <p className="mb-3 text-xs text-slate-500">
          Depo uygulamasındaki PIN'li kullanıcıları puantaj çalışanlarıyla eşleştirin (zimmet eşleştirmesi için).
        </p>
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Kullanıcı</th>
                <th className="px-2 py-2">Rol</th>
                <th className="px-2 py-2">Durum</th>
                <th className="px-2 py-2">Bağlı Çalışan</th>
              </tr>
            </thead>
            <tbody>
              {kullanicilar.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                  <td className="px-2 py-2 font-medium text-slate-900">{row.ad}</td>
                  <td className="px-2 py-2 text-xs text-slate-600">{row.rol}</td>
                  <td className="px-2 py-2">
                    <StatusBadge value={row.aktif ? 'Aktif' : 'Pasif'} />
                  </td>
                  <td className="px-2 py-2">
                    <EmployeeAutocompleteField
                      label=""
                      labelClassName=""
                      employees={employees}
                      value={row.employee_id ? String(row.employee_id) : ''}
                      disabled={!canWrite || bindMutation.isPending}
                      onChange={(value) =>
                        bindMutation.mutate({
                          id: row.id,
                          employeeId: value ? Number(value) : null,
                        })
                      }
                      emptyLabel="Bağlantı yok"
                      helperText={row.employee_ad ? `Şu an: ${row.employee_ad}` : undefined}
                      className="min-w-[220px]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {kullanicilar.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Depo uygulamasında kayıtlı kullanıcı yok.</p>
        ) : null}
      </Panel>
    </div>
  )
}
