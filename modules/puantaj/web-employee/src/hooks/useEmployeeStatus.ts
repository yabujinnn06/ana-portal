import { useEffect, useRef, useState } from 'react'

import { getEmployeeStatus, parseApiError, type ParsedApiError } from '../api/attendance'
import type { EmployeeStatusResponse } from '../types/api'

export type TodayStatus = EmployeeStatusResponse['today_status']

export interface UseEmployeeStatusOptions {
  deviceFingerprint: string | null
  refreshToken?: unknown
  onAuthFailure?: (error: ParsedApiError) => boolean
}

export interface EmployeeStatusState {
  todayStatus: TodayStatus
  statusSnapshot: EmployeeStatusResponse | null
  setTodayStatus: (next: TodayStatus) => void
  setStatusSnapshot: React.Dispatch<React.SetStateAction<EmployeeStatusResponse | null>>
}

export function useEmployeeStatus({
  deviceFingerprint,
  refreshToken,
  onAuthFailure,
}: UseEmployeeStatusOptions): EmployeeStatusState {
  const [todayStatus, setTodayStatus] = useState<TodayStatus>('NOT_STARTED')
  const [statusSnapshot, setStatusSnapshot] = useState<EmployeeStatusResponse | null>(null)

  // onAuthFailure callback ref'le tutuluyor -> useEffect re-run tetiklemez
  // ama her cagrida son referans kullanilir.
  const onAuthFailureRef = useRef(onAuthFailure)
  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

  useEffect(() => {
    if (!deviceFingerprint) {
      setTodayStatus('NOT_STARTED')
      setStatusSnapshot(null)
      return
    }

    let cancelled = false
    const loadStatus = async () => {
      try {
        const statusData = await getEmployeeStatus(deviceFingerprint)
        if (!cancelled) {
          setStatusSnapshot(statusData)
          setTodayStatus(statusData.today_status)
        }
      } catch (error) {
        const parsed = parseApiError(error, 'Durum alınamadı.')
        if (!cancelled) {
          onAuthFailureRef.current?.(parsed)
        }
      }
    }

    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [deviceFingerprint, refreshToken])

  return { todayStatus, statusSnapshot, setTodayStatus, setStatusSnapshot }
}
