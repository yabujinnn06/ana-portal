import { useEffect, useRef, useState } from 'react'

import {
  getEmployeeLeaves,
  parseApiError,
  type ParsedApiError,
} from '../api/attendance'
import type { EmployeeLeaveRecord } from '../types/api'

export interface UseEmployeeLeavesOptions {
  deviceFingerprint: string | null
  enabled: boolean
  refreshToken?: unknown
  onAuthFailure?: (error: ParsedApiError) => boolean
}

export interface EmployeeLeavesState {
  leaveHistory: EmployeeLeaveRecord[]
  isLoading: boolean
  isReady: boolean
  setLeaveHistory: React.Dispatch<React.SetStateAction<EmployeeLeaveRecord[]>>
  refresh: () => void
}

export function useEmployeeLeaves({
  deviceFingerprint,
  enabled,
  refreshToken,
  onAuthFailure,
}: UseEmployeeLeavesOptions): EmployeeLeavesState {
  const [leaveHistory, setLeaveHistory] = useState<EmployeeLeaveRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [internalRefresh, setInternalRefresh] = useState(0)

  const onAuthFailureRef = useRef(onAuthFailure)
  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

  useEffect(() => {
    if (!deviceFingerprint) {
      setLeaveHistory([])
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

    const loadLeaveHistory = async () => {
      try {
        const leaveRows = await getEmployeeLeaves(deviceFingerprint)
        if (!cancelled) {
          const orderedRows = [...leaveRows].sort((left, right) => {
            const leftKey = left.created_at || left.start_date
            const rightKey = right.created_at || right.start_date
            return rightKey.localeCompare(leftKey)
          })
          setLeaveHistory(orderedRows)
          setIsReady(true)
        }
      } catch (error) {
        const parsed = parseApiError(error, 'Izin talepleri alinamadi.')
        if (!cancelled) {
          if (!onAuthFailureRef.current?.(parsed)) {
            setLeaveHistory([])
            setIsReady(false)
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadLeaveHistory()
    return () => {
      cancelled = true
    }
  }, [deviceFingerprint, enabled, refreshToken, internalRefresh, isReady])

  return {
    leaveHistory,
    isLoading,
    isReady,
    setLeaveHistory,
    refresh: () => setInternalRefresh((prev) => prev + 1),
  }
}
