let ctx: AudioContext | null = null;

const _wavCache: Record<string, HTMLAudioElement> = {};

function wavCal(src: string, vol = 1) {
  if (typeof window === "undefined") return;
  let a = _wavCache[src];
  if (!a) {
    a = new Audio(src);
    a.preload = "auto";
    _wavCache[src] = a;
  }
  try {
    const inst = a.cloneNode(true) as HTMLAudioElement;
    inst.volume = vol;
    inst.play().catch(() => {});
  } catch { /* ignore */ }
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const C = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!C) return null;
  if (!ctx) ctx = new C() as AudioContext;
  const c = ctx!;
  if (c.state === "suspended") c.resume().catch(() => {});
  return c;
}

function ton(freq: number, sure: number, baslangic = 0, tip: OscillatorType = "sine", vol = 0.18, freq2?: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + baslangic;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tip;
  o.frequency.setValueAtTime(freq, t0);
  if (freq2 != null) o.frequency.exponentialRampToValueAtTime(freq2, t0 + sure / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure / 1000);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + sure / 1000 + 0.02);
}

function gurultu(sure: number, vol: number, baslangic = 0, freq = 1200, Q = 4) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + baslangic;
  const samp = Math.max(1, Math.floor(c.sampleRate * (sure / 1000)));
  const buf = c.createBuffer(1, samp, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samp; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = Q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure / 1000);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + sure / 1000 + 0.02);
}

const SOUND_BASE = `${import.meta.env.BASE_URL}sounds/`;

export const sound = {
  arm() { ac(); },

  // Barkod okutma onay sesi — basarili sayim
  basarili() {
    wavCal(`${SOUND_BASE}sayildi.wav`);
  },

  // Barkod okutma red sesi — mukerrer/cakisma (sayilamadi)
  uyari() {
    wavCal(`${SOUND_BASE}sayilamadi.wav`);
  },

  // Barkod okutma red sesi — bulunamadi/hata (sayilamadi)
  hata() {
    wavCal(`${SOUND_BASE}sayilamadi.wav`);
  },

  // Kucuk arayuz onayi: tek suit-blip (buton/aksiyon)
  ui() {
    ton(1760, 26, 0, "square", 0.26);
  },

  // Stok gecisi / secim: iki tonlu "select"
  gecis() {
    ton(880, 40, 0,    "square", 0.3);
    ton(1320, 60, 0.05, "square", 0.32);
  },

  // Geri alma: alcalan cift blip
  geriAl() {
    ton(1320, 40, 0,    "square", 0.3);
    ton(880, 70, 0.05,  "square", 0.3);
  },

  // Oturum kapatma: uzun dusuk ton + kapanis blip'i (suit shutdown)
  kapanis() {
    ton(392, 220, 0, "square", 0.3, 196);
    ton(1046, 60, 0.24, "square", 0.3);
  },

  telsizBaslat() {
    ton(1500, 25, 0,     "square", 0.55, 1900);
    gurultu(80, 0.55, 0.025, 1500, 3);
    ton(2100, 35, 0.10,  "square", 0.40);
  },
  telsizBitir() {
    gurultu(110, 0.50, 0,    1200, 3);
    ton(1100, 45, 0.05,  "square", 0.45, 600);
    gurultu(60, 0.30, 0.10, 700, 2);
  },
};

if (typeof window !== "undefined") {
  const arm = () => { sound.arm(); };
  window.addEventListener("click", arm, { once: true });
  window.addEventListener("touchstart", arm, { once: true });
  window.addEventListener("keydown", arm, { once: true });
}
