import { useCallback, useEffect, useRef, useState } from 'react'

import {
  playCheckoutPromptTone,
  playQrErrorTone,
  playQrSuccessTone,
} from '../utils/audio'
import type { ScanErrorPayload } from '../features/home/ScanFeedbackOverlays'

const SUCCESS_AUTO_CLOSE_MS = 2500
const ERROR_AUTO_CLOSE_MS = 4500
const SUCCESS_VIBRATE_DEFAULT: number[] = [200, 80, 200]
const SUCCESS_VIBRATE_CONFIRM: number[] = [220, 80, 220, 80, 320]
const ERROR_VIBRATE: number[] = [300, 100, 300, 100, 500]

export interface ScanFeedback {
  successOpen: boolean
  errorPayload: ScanErrorPayload | null
  triggerSuccess: (tone?: 'default' | 'confirm') => void
  triggerError: (payload: { title?: string; message: string; requestId?: string | null }) => void
  dismissError: () => void
}

function vibrate(pattern: number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(pattern)
  }
}

export function useScanFeedback(): ScanFeedback {
  const [successOpen, setSuccessOpen] = useState(false)
  const [errorPayload, setErrorPayload] = useState<ScanErrorPayload | null>(null)
  const successTimerRef = useRef<number | null>(null)
  const errorTimerRef = useRef<number | null>(null)

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }, [])

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  const triggerSuccess = useCallback(
    (tone: 'default' | 'confirm' = 'default') => {
      clearSuccessTimer()
      setSuccessOpen(true)
      if (tone === 'confirm') {
        playCheckoutPromptTone()
        vibrate(SUCCESS_VIBRATE_CONFIRM)
      } else {
        playQrSuccessTone()
        vibrate(SUCCESS_VIBRATE_DEFAULT)
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccessOpen(false)
        successTimerRef.current = null
      }, SUCCESS_AUTO_CLOSE_MS)
    },
    [clearSuccessTimer],
  )

  const triggerError = useCallback(
    (payload: { title?: string; message: string; requestId?: string | null }) => {
      clearErrorTimer()
      setErrorPayload({
        title: payload.title?.trim() || 'Islem tamamlanamadi',
        message: payload.message,
        requestId: payload.requestId ?? null,
      })
      playQrErrorTone()
      vibrate(ERROR_VIBRATE)
      errorTimerRef.current = window.setTimeout(() => {
        setErrorPayload(null)
        errorTimerRef.current = null
      }, ERROR_AUTO_CLOSE_MS)
    },
    [clearErrorTimer],
  )

  const dismissError = useCallback(() => {
    clearErrorTimer()
    setErrorPayload(null)
  }, [clearErrorTimer])

  useEffect(() => () => clearSuccessTimer(), [clearSuccessTimer])
  useEffect(() => () => clearErrorTimer(), [clearErrorTimer])

  return {
    successOpen,
    errorPayload,
    triggerSuccess,
    triggerError,
    dismissError,
  }
}
