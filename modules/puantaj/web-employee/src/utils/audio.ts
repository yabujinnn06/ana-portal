// Web Audio API ile synthesize edilmis dogal sesler.
// Tarayici desteklemiyorsa sessiz fallback.

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext || null
}

// Synthetic reverb - yagmur ortami hissi
function createReverb(ctx: AudioContext, duration = 1.0, decay = 2.8): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * duration)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  const convolver = ctx.createConvolver()
  convolver.buffer = impulse
  return convolver
}

// Tek su damlasi: noise transient + resonant sine body + pitch sweep asagi
function scheduleWaterDrop(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  time: number,
  gainAmt = 0.35,
) {
  // --- Resonant body (sine) ---
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq * 1.6, time)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, time + 0.28)
  oscGain.gain.setValueAtTime(gainAmt, time)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38)
  osc.connect(oscGain)
  oscGain.connect(dest)
  osc.start(time)
  osc.stop(time + 0.4)

  // --- Splash transient (filtered noise) ---
  const noiseLen = Math.floor(ctx.sampleRate * 0.06)
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < noiseLen; i++) {
    nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 1.8)
  }
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuf

  const bpf = ctx.createBiquadFilter()
  bpf.type = 'bandpass'
  bpf.frequency.value = freq * 1.2
  bpf.Q.value = 6

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(gainAmt * 0.45, time)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06)

  noise.connect(bpf)
  bpf.connect(noiseGain)
  noiseGain.connect(dest)
  noise.start(time)
  noise.stop(time + 0.07)
}

// Check-in: yukari tirmanан uc damla (do-mi-sol), sicak ve kaldirici
export function playCheckinSuccessTone(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.72, ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2)

    const reverb = createReverb(ctx, 1.2, 2.8)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = 0.55
    wet.gain.value = 0.45

    master.connect(dry)
    master.connect(reverb)
    reverb.connect(wet)
    dry.connect(ctx.destination)
    wet.connect(ctx.destination)

    const now = ctx.currentTime
    // do - mi - sol (freqleri 440hz referans, hafif yukarida)
    scheduleWaterDrop(ctx, master, 528, now,        0.38)
    scheduleWaterDrop(ctx, master, 660, now + 0.14, 0.34)
    scheduleWaterDrop(ctx, master, 784, now + 0.28, 0.30)
    // son damla biraz daha kucuk - echo hissi
    scheduleWaterDrop(ctx, master, 880, now + 0.50, 0.14)

    window.setTimeout(() => void ctx.close(), 2400)
  } catch { /* sessiz fallback */ }
}

// Check-out: asagi inen iki damla, sakin ve kapanisli
export function playCheckoutSuccessTone(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.60, ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.0)

    const reverb = createReverb(ctx, 1.4, 3.2)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = 0.50
    wet.gain.value = 0.50

    master.connect(dry)
    master.connect(reverb)
    reverb.connect(wet)
    dry.connect(ctx.destination)
    wet.connect(ctx.destination)

    const now = ctx.currentTime
    // yukari sonra asagi - "gun bitiyor" hissi
    scheduleWaterDrop(ctx, master, 660, now,        0.34)
    scheduleWaterDrop(ctx, master, 528, now + 0.18, 0.30)
    // uzak bir yankı damlasi
    scheduleWaterDrop(ctx, master, 396, now + 0.45, 0.12)

    window.setTimeout(() => void ctx.close(), 2200)
  } catch { /* sessiz fallback */ }
}

// QR basari: tek guzel damla + kisa parlaklık
export function playQrSuccessTone(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.65, ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8)

    const reverb = createReverb(ctx, 0.9, 2.5)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = 0.60
    wet.gain.value = 0.40
    master.connect(dry)
    master.connect(reverb)
    reverb.connect(wet)
    dry.connect(ctx.destination)
    wet.connect(ctx.destination)

    const now = ctx.currentTime
    scheduleWaterDrop(ctx, master, 740, now,        0.40)
    scheduleWaterDrop(ctx, master, 988, now + 0.12, 0.22)

    window.setTimeout(() => void ctx.close(), 2000)
  } catch { /* sessiz fallback */ }
}

// QR hata: kisa, ici bos, dusuk - kulak yormuyor ama net
export function playQrErrorTone(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime

    // hollow "thud" - square wave, dusuk frekans, hizli sunum
    osc.type = 'square'
    osc.frequency.setValueAtTime(160, now)
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.22)

    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 300

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)

    osc.connect(lpf)
    lpf.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.26)
    osc.onended = () => void ctx.close()
  } catch { /* sessiz fallback */ }
}

// Checkout prompt (eski - geriye donuk uyumluluk)
export function playCheckoutPromptTone(): void {
  playCheckoutSuccessTone()
}

// Haptik geri bildirim (destekleyen cihazda titresim).
export const VIBRATE_SUCCESS: number[] = [200, 80, 200]
export const VIBRATE_CONFIRM: number[] = [220, 80, 220, 80, 320]
export const VIBRATE_ERROR: number[] = [300, 100, 300, 100, 500]

export function vibrate(pattern: number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(pattern)
  }
}

// Demo/mola: hafif iki damla, notal
export function playDemoPromptTone(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.55, ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6)

    const reverb = createReverb(ctx, 0.8, 2.2)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = 0.65
    wet.gain.value = 0.35
    master.connect(dry)
    master.connect(reverb)
    reverb.connect(wet)
    dry.connect(ctx.destination)
    wet.connect(ctx.destination)

    const now = ctx.currentTime
    scheduleWaterDrop(ctx, master, 594, now,        0.32)
    scheduleWaterDrop(ctx, master, 594, now + 0.20, 0.20)

    window.setTimeout(() => void ctx.close(), 1800)
  } catch { /* sessiz fallback */ }
}
