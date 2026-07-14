import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Mic, Send, ChevronDown, Volume2, VolumeX, MessageSquare, Signal } from "lucide-react";
import { ChatMesaji, SayimWS, SesMesaji } from "../lib/ws";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useTelsizKayit, MAX_KAYIT_SN } from "../lib/useTelsizKayit";
import { cn } from "../lib/cn";

const PALET = ["#BF6F34", "#7FB3E0", "#5FBE7A", "#F4B183", "#9B7EBD", "#D27A8B", "#3D9CA3", "#C9A659"];
function rengini(ad: string): string {
  if (!ad) return "#7FB3E0";
  let h = 0;
  for (let i = 0; i < ad.length; i++) h = (h * 31 + ad.charCodeAt(i)) >>> 0;
  return PALET[h % PALET.length];
}
function saat(z: string) {
  return new Date(z).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

type Item = (ChatMesaji | SesMesaji) & { yerel_id: string; oynatildi?: boolean };

type Props = {
  ws: SayimWS | null;
  son: ChatMesaji | SesMesaji | null;
  oturumId: number;
  // gomulu: kamera tam ekran gibi yerlerde in-flow tek satir; fixed degil, autoplay kapali (ses ana bar'da)
  gomulu?: boolean;
};

export default function TelsizBar({ ws, son, oturumId, gomulu = false }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [metin, setMetin] = useState("");
  const [acik, setAcik] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [okunmamis, setOkunmamis] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { kayit, kayitSn, seviyeler, baslat, dur } = useTelsizKayit(ws, m => toast.push("warn", m));

  useEffect(() => {
    if (!son) return;
    setItems(prev => [...prev, { ...son, yerel_id: `${son.kullanici_id}_${son.zaman}_${Math.random()}` }].slice(-80));
    if (son.kullanici_id !== user?.id && !acik) setOkunmamis(n => Math.min(99, n + 1));
  }, [son]);

  useEffect(() => { if (acik) setOkunmamis(0); }, [acik]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, acik]);

  // gelen sesi otomatik oynat; gomulu modda kapali (ses ana bar tarafindan yonetilir, cift oynatma olmasin)
  useEffect(() => {
    if (gomulu || !autoplay) return;
    const sonItem = items[items.length - 1];
    if (!sonItem || sonItem.tip !== "voice" || sonItem.oynatildi) return;
    if (sonItem.kullanici_id === user?.id) return;
    try {
      new Audio(`data:${sonItem.mime};base64,${sonItem.data}`).play().catch(() => {});
    } catch { /* ignore */ }
    setItems(prev => prev.map(x => x.yerel_id === sonItem.yerel_id ? { ...x, oynatildi: true } : x));
  }, [items, autoplay, user?.id, gomulu]);

  function gonderChat(e: FormEvent) {
    e.preventDefault();
    const v = metin.trim();
    if (!v) return;
    if (!ws?.send({ tip: "chat", mesaj: v })) toast.push("err", "WS baglanti yok");
    setMetin("");
  }

  function oynat(b64: string, mime: string) {
    try { new Audio(`data:${mime};base64,${b64}`).play().catch(() => {}); } catch { /* ignore */ }
  }

  const kanal = `CH-${String(oturumId).padStart(2, "0")}`;
  const baglantili = !!ws;
  const sonItem = items[items.length - 1];

  const pttHandlers = {
    onPointerDown: baslat,
    onPointerUp: dur,
    onPointerLeave: dur,
    onPointerCancel: dur,
  };

  const barIcerik = (
    <>
      {/* kanal + durum */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Radio size={15} className="text-accent" />
        <span className="font-mono text-[11px] tracking-widest text-emerald-300 hidden sm:inline">{kanal}</span>
        <span className={cn("inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1 rounded",
          baglantili ? "text-emerald-300" : "text-red-400")}>
          <Signal size={9} /> {baglantili ? "ON-AIR" : "OFF"}
        </span>
      </div>

      {/* orta: kayit VU veya son mesaj ticker */}
      <div className="flex-1 min-w-0 px-1">
        {kayit ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="font-mono text-[10px] text-red-300 shrink-0">REC {kayitSn}/{MAX_KAYIT_SN}s</span>
            <div className="flex items-end gap-0.5 h-4">
              {seviyeler.map((v, i) => (
                <div key={i} className={cn("w-0.5 rounded-sm", v > 0.6 ? "bg-red-400" : v > 0.3 ? "bg-amber-300" : "bg-emerald-400")}
                  style={{ height: `${Math.max(10, v * 100)}%` }} />
              ))}
            </div>
          </div>
        ) : sonItem ? (
          <div className="font-mono text-[11px] truncate text-zinc-300">
            <span className="text-zinc-500">[{saat(sonItem.zaman)}] </span>
            <span style={{ color: rengini(sonItem.ad) }}>
              {sonItem.kullanici_id === user?.id ? "BEN" : sonItem.ad}:
            </span>{" "}
            {sonItem.tip === "chat"
              ? <span className="text-emerald-200">{sonItem.mesaj}</span>
              : <span className="text-amber-300 inline-flex items-center gap-1"><Mic size={11} /> ses{sonItem.sure ? ` ${Math.round(sonItem.sure)}sn` : ""}</span>}
          </div>
        ) : (
          <span className="font-mono text-[11px] text-zinc-500">Telsiz sessiz. Konuşmak için PTT bas.</span>
        )}
      </div>

      {/* hizli yazi (genis ekran) */}
      <form onSubmit={gonderChat} className="hidden md:flex items-center gap-1 shrink-0">
        <input value={metin} onChange={e => setMetin(e.target.value)}
          placeholder="mesaj…"
          className="w-40 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-emerald-100 placeholder:text-zinc-600 font-mono text-xs outline-none focus:border-emerald-500/60" />
        {metin.trim() && (
          <button type="submit" className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-emerald-200" title="Gönder">
            <Send size={13} />
          </button>
        )}
      </form>

      {/* PTT */}
      <button type="button" {...pttHandlers}
        className={cn("relative h-8 px-2.5 rounded-full flex items-center gap-1 select-none touch-none transition shrink-0 text-xs font-semibold",
          kayit ? "bg-red-600 text-white scale-95 shadow-[0_0_14px_3px_rgba(220,90,90,0.5)]"
                : "bg-gradient-to-b from-zinc-600 to-zinc-800 text-white hover:from-zinc-500")}
        title="Basılı tut: konuş">
        <Mic size={14} /> <span className="hidden sm:inline">PTT</span>
      </button>

      {/* mute */}
      <button onClick={() => setAutoplay(a => !a)}
        className={cn("p-1.5 rounded shrink-0", autoplay ? "text-emerald-300 hover:bg-white/10" : "text-zinc-500 hover:bg-white/10")}
        title={autoplay ? "Otomatik oynatma açık" : "Sessiz"}>
        {autoplay ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>

      {/* gecmis ac/kapat (sadece normal modda) */}
      {!gomulu && (
        <button onClick={() => setAcik(a => !a)}
          className="relative p-1.5 rounded text-zinc-300 hover:bg-white/10 shrink-0" title="Telsiz geçmişi">
          <ChevronDown size={16} className={cn("transition-transform", acik && "rotate-180")} />
          {!acik && okunmamis > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[#101014]">
              {okunmamis}
            </span>
          )}
        </button>
      )}
    </>
  );

  const cubuk = (
    <div className="h-11 border-b border-zinc-800 text-zinc-200"
      style={{ background: "linear-gradient(180deg,#1b1b20,#101014)" }}>
      <div className={cn("h-full flex items-center gap-2 px-2 sm:px-3", gomulu ? "" : "max-w-6xl mx-auto")}>
        {barIcerik}
      </div>
    </div>
  );

  // gomulu: in-flow tek satir (kamera tam ekranin en ustu gibi)
  if (gomulu) return cubuk;

  return (
    <>
      {/* sabit bar yuksekligi kadar yer ayir (fixed oldugu icin akista yer kaplamaz) */}
      <div className="h-11" aria-hidden />

      <div className="fixed top-14 inset-x-0 z-40">{cubuk}</div>

      {/* acilir gecmis paneli */}
      <AnimatePresence>
        {acik && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="fixed top-[100px] right-2 sm:right-4 z-40 w-[min(96vw,30rem)] rounded-xl border border-zinc-800 shadow-2xl shadow-black/40 overflow-hidden"
            style={{ background: "#0a0a0f" }}>
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
              <span className="font-mono text-xs text-emerald-300 tracking-widest flex items-center gap-1.5">
                <Radio size={13} className="text-accent" /> {kanal} · TELSIZ
              </span>
              <button onClick={() => setAcik(false)} className="font-mono text-[10px] text-zinc-400 hover:text-zinc-200">kapat</button>
            </div>
            <div ref={listRef} className="overflow-y-auto p-3 space-y-1.5 overscroll-contain max-h-[50vh] min-h-[120px]">
              {items.length === 0 && (
                <div className="text-center text-zinc-500 text-xs py-6">
                  <MessageSquare size={18} className="inline mb-1 opacity-40" />
                  <div>Henüz mesaj yok.</div>
                </div>
              )}
              {items.map(it => {
                const benim = it.kullanici_id === user?.id;
                return (
                  <div key={it.yerel_id} className="font-mono text-[12px] leading-relaxed flex items-baseline gap-2">
                    <span className="text-zinc-500 shrink-0">[{saat(it.zaman)}]</span>
                    <span className="font-bold shrink-0" style={{ color: rengini(it.ad) }}>{benim ? "BEN" : it.ad}:</span>
                    {it.tip === "chat" ? (
                      <span className={cn("break-words", benim ? "text-zinc-200" : "text-emerald-200")}>{it.mesaj}</span>
                    ) : (
                      <button onClick={() => oynat(it.data, it.mime)} className="inline-flex items-center gap-1 text-amber-300 hover:underline">
                        <Mic size={12} /> «ses{it.sure ? ` ${Math.round(it.sure)}sn` : ""}»
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <form onSubmit={gonderChat} className="p-2 border-t border-zinc-800 flex items-center gap-2">
              <input value={metin} onChange={e => setMetin(e.target.value)}
                placeholder="mesaj yaz…"
                className="flex-1 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-emerald-100 placeholder:text-zinc-600 font-mono text-sm outline-none focus:border-emerald-500/60" />
              <button type="submit" className="p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-emerald-200" title="Gönder">
                <Send size={15} />
              </button>
              <button type="button" {...pttHandlers}
                className={cn("h-9 w-9 rounded-full flex items-center justify-center select-none touch-none transition",
                  kayit ? "bg-red-600 text-white scale-95" : "bg-gradient-to-b from-zinc-600 to-zinc-800 text-white")}
                title="Basılı tut: konuş">
                <Mic size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
