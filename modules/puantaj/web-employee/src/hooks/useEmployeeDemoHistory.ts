import { useEffect, useRef, useState } from 'react'

import {
  getEmployeeDemoHistory,
  parseApiError,
  type ParsedApiError,
} from '../api/attendance'
import type { EmployeeDemoDayResponse } from '../types/api'

export interface UseEmployeeDemoHistoryOptions {
  deviceFingerprint: string | null
  enabled: boolean
  lastStartedAtUtc?: string | null
  lastEndedAtUtc?: string | null
  onAuthFailure?: (error: ParsedApiError) => boolean
}

export interface EmployeeDemoHistoryState {
  demoHistory: EmployeeDemoDayResponse | null
  isLoading: boolean
  isReady: boolean
  setDemoHistory: React.Dispatch<React.SetStateAction<EmployeeDemoDayResponse | null>>
}

export function useEmployeeDemoHistory({
  deviceFingerprint,
  enabled,
  lastStartedAtUtc,
  lastEndedAtUtc,
  onAuthFailure,
}: UseEmployeeDemoHistoryOptions): EmployeeDemoHistoryState {
  const [demoHistory, setDemoHistory] = useState<EmployeeDemoDayResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const onAuthFailureRef = useRef(onAuthFailure)
  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

  useEffect(() => {
    if (!deviceFingerprint) {
      setDemoHistory(null)
      setIsLoading(false)
      setIsReady(false)
      return
    }
    if (!enabled) {
      return
    }

    let cancelled = false
    if (!isReady) {
      setIsLoading(true)
    }

    const loadDemoHistory = async () => {
      try {
        const historyData = await getEmployeeDemoHistory(deviceFingerprint)
        if (!cancelled) {
          setDemoHistory(historyData)
          setIsReady(true)
        }
      } catch (error) {
        const parsed = parseApiError(error, 'Demo listesi alinamadi.')
        if (!cancelled) {
          if (!onAuthFailureRef.current?.(parsed)) {
            setDemoHistory(null)
            setIsReady(false)
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDemoHistory()
    return () => {
      cancelled = true
    }
    // isReady kasıtlı dependency: ilk yuklemeden sonra spinner gostermez
  }, [deviceFingerprint, enabled, lastStartedAtUtc, lastEndedAtUtc, isReady])

  return { demoHistory, isLoading, isReady, setDemoHistory }
}
