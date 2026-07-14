// Small pub/sub singleton that drives the full-screen "sisteme giriş/çıkış"
// overlay (blue gradient + rotating polygon canvas). Kept outside React state
// so it can be triggered from anywhere (login submit handler, logout button)
// without prop drilling or context plumbing.

export type SystemTransitionMode = 'enter' | 'exit'

export interface SystemTransitionState {
  active: boolean
  mode: SystemTransitionMode
  message: string
}

type Listener = (state: SystemTransitionState) => void

let state: SystemTransitionState = { active: false, mode: 'enter', message: '' }
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) {
    listener(state)
  }
}

export function getSystemTransitionState(): SystemTransitionState {
  return state
}

export function subscribeSystemTransition(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function showSystemTransition(mode: SystemTransitionMode, message: string): void {
  state = { active: true, mode, message }
  emit()
}

export function hideSystemTransition(): void {
  state = { ...state, active: false }
  emit()
}

/**
 * Runs `action` while showing the full-screen transition overlay, guaranteeing
 * it stays visible for at least `minDurationMs` so the animation is actually
 * perceivable even when the underlying request resolves instantly.
 */
export async function runWithSystemTransition(
  mode: SystemTransitionMode,
  message: string,
  action: () => Promise<void> | void,
  minDurationMs = 2200,
): Promise<void> {
  showSystemTransition(mode, message)
  const startedAt = Date.now()
  try {
    await action()
  } finally {
    const elapsed = Date.now() - startedAt
    const remaining = Math.max(0, minDurationMs - elapsed)
    window.setTimeout(hideSystemTransition, remaining)
  }
}
