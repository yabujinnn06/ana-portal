// Web Audio ile kisa mesaj sesleri (harici dosya gerekmez).
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) {
        return null
      }
      ctx = new AC()
    }
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    return ctx
  } catch {
    return null
  }
}

function tone(c: AudioContext, freq: number, startOffset: number, duration: number, peak: number) {
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export function playSound(kind: 'send' | 'receive') {
  const c = audioCtx()
  if (!c) {
    return
  }
  try {
    if (kind === 'send') {
      tone(c, 520, 0, 0.11, 0.07)
    } else {
      tone(c, 660, 0, 0.12, 0.08)
      tone(c, 880, 0.1, 0.16, 0.08)
    }
  } catch {
    /* sessiz gec */
  }
}
