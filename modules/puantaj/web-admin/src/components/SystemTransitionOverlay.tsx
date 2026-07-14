import { useEffect, useState } from 'react'

import {
  getSystemTransitionState,
  subscribeSystemTransition,
  type SystemTransitionState,
} from '../lib/systemTransition'
import { LoginCanvasBackground } from './LoginCanvasBackground'

type Phase = 'idle' | 'entering' | 'leaving'

const LEAVE_ANIMATION_MS = 320

/**
 * Full-screen "sisteme giriş / çıkış" transition: blue gradient background
 * with the same rotating polygon canvas used on the login screen. Mounted
 * once near the app root and driven imperatively via systemTransition.ts so
 * it can be shown from the login submit handler and the logout button.
 */
export function SystemTransitionOverlay() {
  const [state, setState] = useState<SystemTransitionState>(getSystemTransitionState())
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(
    () =>
      subscribeSystemTransition((next) => {
        setState(next)
        setPhase(next.active ? 'entering' : 'leaving')
      }),
    [],
  )

  useEffect(() => {
    if (phase !== 'leaving') {
      return
    }
    const timer = window.setTimeout(() => setPhase('idle'), LEAVE_ANIMATION_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'idle') {
    return null
  }

  const adminLogoUrl = `${import.meta.env.BASE_URL}admin-logo.svg`

  return (
    <div
      className={`system-transition system-transition--${state.mode} system-transition--${phase}`}
      role="status"
      aria-live="polite"
    >
      <LoginCanvasBackground />
      <div className="system-transition-content">
        <img src={adminLogoUrl} alt="" width={56} height={56} className="system-transition-logo" />
        <span className="system-transition-wordmark">
          Puantaj<span className="admin-login-wordmark-sub">RW</span>
        </span>
        <span className="system-transition-spinner" aria-hidden="true" />
        <p className="system-transition-message">{state.message}</p>
      </div>
    </div>
  )
}
