import { useRef, useState } from "react";
import { SayimWS } from "./ws";
import { sound } from "./sound";

export const MAX_KAYIT_SN = 15;

// Push-to-talk ses kaydi: getUserMedia + MediaRecorder + VU analiz, durunca WS'e voice gonderir.
export function useTelsizKayit(ws: SayimWS | null, onHata?: (m: string) => void) {
  const [kayit, setKayit] = useState(false);
  const [kayitSn, setKayitSn] = useState(0);
  const [seviyeler, setSeviyeler] = useState<number[]>(Array(12).fill(0));
  const recRef = useRef<MediaRecorder | null>(null);
  const sayacRef = useRef<number | undefined>(undefined);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  async function baslat() {
    if (recRef.current) return;
    sound.telsizBaslat();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 16000 } : { audioBitsPerSecond: 16000 });
      recRef.current = rec;

      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx: AudioContext = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 64;
        src.connect(an);
        analyzerRef.current = an;
        const buf = new Uint8Array(an.frequencyBinCount);
        const tik = () => {
          if (!analyzerRef.current) return;
          analyzerRef.current.getByteFrequencyData(buf);
          const bars: number[] = [];
          const step = Math.floor(buf.length / 12);
          for (let i = 0; i < 12; i++) bars.push(buf[i * step] / 255);
          setSeviyeler(bars);
          animRef.current = requestAnimationFrame(tik);
        };
        tik();
      }

      const chunks: Blob[] = [];
      let sn = 0;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (animRef.current) cancelAnimationFrame(animRef.current);
        try { audioCtxRef.current?.close(); } catch { /* ignore */ }
        analyzerRef.current = null;
        audioCtxRef.current = null;
        setSeviyeler(Array(12).fill(0));
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0 || blob.size > 250_000) {
          onHata?.(`Ses ${blob.size === 0 ? "bos" : "cok uzun"}, gonderilmedi`);
          return;
        }
        const ab = await blob.arrayBuffer();
        const bin = new Uint8Array(ab);
        let s = ""; for (let i = 0; i < bin.byteLength; i++) s += String.fromCharCode(bin[i]);
        const b64 = btoa(s);
        const ok = ws?.send({ tip: "voice", data: b64, mime: rec.mimeType || "audio/webm", sure: sn });
        if (!ok) onHata?.("WS baglanti yok");
      };
      rec.start();
      setKayit(true);
      setKayitSn(0);
      sayacRef.current = window.setInterval(() => {
        sn += 1;
        setKayitSn(sn);
        if (sn >= MAX_KAYIT_SN) dur();
      }, 1000);
    } catch {
      onHata?.("Mikrofon izni reddedildi");
    }
  }

  function dur() {
    if (sayacRef.current) { window.clearInterval(sayacRef.current); sayacRef.current = undefined; }
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    try { if (rec.state !== "inactive") rec.stop(); } catch { /* noop */ }
    setKayit(false);
    sound.telsizBitir();
  }

  return { kayit, kayitSn, seviyeler, baslat, dur };
}
