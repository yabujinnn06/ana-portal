import { useEffect, useRef, useState } from 'react'

import { getDepoOzet, parseApiError, type ParsedApiError } from '../api/attendance'
import type { DepoOzetDepo } from '../types/api'

export interface UseDepoOzetOptions {
  deviceFingerprint: string | null
  enabled: boolean
  refreshToken?: unknown
  onAuthFailure?: (error: ParsedApiError) => boolean
}

export interface DepoOzetState {
  izinli: boolean
  depolar: DepoOzetDepo[]
  isLoading: boolean
  isReady: boolean
  refresh: () => void
}

export function useDepoOzet({
  deviceFingerprint,
  enabled,
  refreshToken,
  onAuthFailure,
}: UseDepoOzetOptions): DepoOzetState {
  const [izinli, setIzinli] = useState(false)
  const [depolar, setDepolar] = useState<DepoOzetDepo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [internalRefresh, setInternalRefresh] = useState(0)

  const onAuthFailureRef = useRef(onAuthFailure)
  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

  useEffect(() => {
    if (!deviceFingerprint) {
      setIzinli(false)
      setDepolar([])
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

    const loadOzet = async () => {
      try {
        const ozet = await getDepoOzet(deviceFingerprint)
        if (!cancelled) {
          setIzinli(ozet.izin)
          setDepolar(ozet.depolar ?? [])
          setIsReady(true)
        }
      } catch (error) {
        const parsed = parseApiError(error, 'Depo bilgisi alınamadı.')
        if (!cancelled) {
          if (!onAuthFailureRef.current?.(parsed)) {
            // Sessiz basarisizlik: izin yokmus gibi davran, nav'da modul gorunmesin.
            setIzinli(false)
            setDepolar([])
            setIsReady(true)
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOzet()
    return () => {
      cancelled = true
    }
  }, [deviceFingerprint, enabled, refreshToken, internalRefresh, isReady])

  return {
    izinli,
    depolar,
    isLoading,
    isReady,
    refresh: () => setInternalRefresh((prev) => prev + 1),
  }
}
