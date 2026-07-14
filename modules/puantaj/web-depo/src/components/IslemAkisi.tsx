import { FormEvent, KeyboardEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { Filter as FilterIcon } from "lucide-react";
import { api, LogSatir, StokOzet } from "../lib/api";
import { cn } from "../lib/cn";
import PanelHeader from "./ui/PanelHeader";
import StatusBadge, { StatusTone, TARAMA_DURUM } from "./ui/StatusBadge";

const PALET = ["#BF6F34", "#7FB3E0", "#5FBE7A", "#F4B183", "#9B7EBD", "#D27A8B", "#3D9CA3", "#C9A659"];

function kullaniciRengi(ad: string): string {
  if (!ad) return "#7FB3E0";
  let h = 0;
  for (let i = 0; i < ad.length; i++) h = (h * 31 + ad.charCodeAt(i)) >>> 0;
  return PALET[h % PALET.length];
}

function saatFormat(t: string | number) {
  return new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type FiltreTip = "tum" | "basarili" | "mukerrer" | "bulunamadi" | "cakisma";

type CmdOut = { id: string; ts: number; lines: string[]; tone: StatusTone | "info" };
type Item =
  | { id: string; ts: number; tip: "scan"; row: LogSatir }
  | { id: string; ts: number; tip: "cmd"; lines: string[]; tone: StatusTone | "info" };

type Props = {
  rows: LogSatir[];
  oturumId: number;
  stoklar: StokOzet[];
  onSec?: (row: LogSatir) => void;
};

const KOMUTLAR = ["help", "clear", "tara", "ozet", "bul", "stok", "users", "audit", "kim", "history"];

const CMD_TONE_CLS: Record<StatusTone | "info", string> = {
  good: "text-good-ink", warn: "text-warn-ink", bad: "text-bad-ink", neutral: "text-ink/50", info: "text-ink/70",
};

const FILTRE_AKTIF_CLS: Record<StatusTone, string> = {
  good: "bg-good/20 text-good-ink",
  warn: "bg-warn/20 text-warn-ink",
  bad: "bg-bad/20 text-bad-ink",
  neutral: "bg-deep text-white",
};

function _IslemAkisi({ rows, oturumId, stoklar, onSec }: Props) {
  const [filtre, setFiltre] = useState<FiltreTip>("tum");
  const [cmds, setCmds] = useState<CmdOut[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const cikisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  const son = rows[0] ?? null;
  const sonGecenSn = son ? Math.max(0, Math.floor((now - new Date(son.zaman).getTime()) / 1000)) : Infinity;
  const canli = sonGecenSn < 5;

  const durumSayim = useMemo(() => {
    const o = { basarili: 0, mukerrer: 0, bulunamadi: 0, cakisma: 0 } as Record<string, number>;
    rows.forEach(r => { if (o[r.durum] != null) o[r.durum]++; });
    return o;
  }, [rows]);

  const goster = useMemo(() => {
    const filt = filtre === "tum" ? rows : rows.filter(r => r.durum === filtre);
    return filt.slice(0, 60);
  }, [rows, filtre]);

  const items = useMemo<Item[]>(() => {
    const arr: Item[] = [];
    goster.forEach(r => arr.push({ id: `s${r.id}`, ts: new Date(r.zaman).getTime(), tip: "scan", row: r }));
    cmds.forEach(c => arr.push({ id: c.id, ts: c.ts, tip: "cmd", lines: c.lines, tone: c.tone }));
    return arr.sort((a, b) => b.ts - a.ts);
  }, [goster, cmds]);

  useEffect(() => {
    const el = cikisRef.current;
    if (el) el.scrollTop = 0;
  }, [items.length]);

  function pushOut(lines: string[], tone: StatusTone | "info" = "info") {
    setCmds(prev => [...prev, { id: `c${Date.now()}_${Math.random()}`, ts: Date.now(), lines, tone }]);
  }

  async function calistir(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;
    setHistory(h => [...h.filter(x => x !== cmd), cmd].slice(-50));
    setHistIdx(-1);
    pushOut([`> ${cmd}`], "info");
    const [name, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ").trim();
    try {
      switch (name) {
        case "help":
          pushOut([
            "komutlar:",
            "  help                komut listesi",
            "  clear               çıktıyı temizle",
            "  tara <seri>         barkod tara",
            "  ozet                oturum özeti",
            "  bul <q>             stok ara",
            "  stok <kod>          stok detayı",
            "  users               kullanıcı listesi (admin)",
            "  audit               son aksiyonlar (admin)",
            "  kim                 mevcut kullanıcı",
            "  history             komut geçmişi",
          ]);
          break;
        case "clear":
          setCmds([]);
          break;
        case "tara": {
          if (!arg) { pushOut(["seri argümanı bekleniyor: tara <seri>"], "bad"); break; }
          const r = await api.tara(oturumId, arg);
          const cizgi = [
            `durum: ${r.durum}  ${r.mesaj}`,
            r.stok_kodu ? `stok:  ${r.stok_kodu} ${r.urun_adi ?? ""}` : "",
            (r.sayilan != null) ? `sayım: ${r.sayilan}/${r.toplam}  kalan ${r.kalan}  portal ${r.portal_sayim ?? "—"} (fark ${r.portal_fark ?? "—"})` : "",
            r.cakisan_stoklar ? `çakışan: ${r.cakisan_stoklar.join(", ")}` : "",
          ].filter(Boolean);
          pushOut(cizgi, TARAMA_DURUM[r.durum]?.tone ?? "info");
          break;
        }
        case "ozet": {
          const o = await api.oturumOzet(oturumId);
          pushOut([
            `stok        ${o.stok_sayisi}`,
            `toplam seri ${o.toplam_seri}`,
            `sayılan     ${o.sayilan_seri}  (kalan ${o.kalan_seri})`,
            `portal      ${o.portal_toplam}  (fark ${o.portal_fark})`,
            o.son_islem ? `son işlem   ${new Date(o.son_islem).toLocaleString("tr-TR")}` : "",
          ].filter(Boolean));
          break;
        }
        case "bul": {
          if (!arg) { pushOut(["sorgu lazım"], "bad"); break; }
          const q = arg.toLowerCase();
          const hits = stoklar.filter(s => `${s.stok_kodu} ${s.urun_adi}`.toLowerCase().includes(q)).slice(0, 12);
          pushOut(hits.length ? hits.map(s => `${s.stok_kodu.padEnd(10)} ${s.sayilan}/${s.toplam}  ${s.urun_adi}`) : ["eşleşen yok"]);
          break;
        }
        case "stok": {
          if (!arg) { pushOut(["stok kodu lazım"], "bad"); break; }
          const s = stoklar.find(x => x.stok_kodu === arg);
          if (!s) { pushOut([`${arg} bulunamadı`], "bad"); break; }
          pushOut([
            `${s.stok_kodu}  ${s.urun_adi}`,
            `sayım ${s.sayilan}/${s.toplam}  portal ${s.portal_sayim}  fark ${s.sayilan - s.portal_sayim}`,
            s.sonradan_eklendi ? "not: sonradan eklenen stok" : "",
          ].filter(Boolean));
          break;
        }
        case "users":
        case "kullanicilar": {
          const us = await api.users();
          pushOut(us.map(u => `${u.ad.padEnd(20)} ${u.rol}${u.aktif ? "" : "  (pasif)"}`));
          break;
        }
        case "audit": {
          const a = await api.audit(undefined, undefined, 10, 0);
          pushOut(a.items.map(x =>
            `${new Date(x.zaman).toLocaleString("tr-TR")} ${(x.kullanici_ad ?? "?").padEnd(12)} ${x.eylem}` +
            (x.kaynak_tip ? ` ${x.kaynak_tip}#${x.kaynak_id}` : "")
          ));
          break;
        }
        case "kim": {
          const me = await api.me();
          pushOut([`${me.ad} (${me.rol})`]);
          break;
        }
        case "history": {
          pushOut(history.length ? history.slice(-20).map((c, i) => `${String(i + 1).padStart(3)} ${c}`) : ["geçmiş boş"]);
          break;
        }
        default:
          pushOut([`bilinmeyen komut: ${name}. 'help' yaz.`], "bad");
      }
    } catch (e: any) {
      pushOut([e.message ?? "hata"], "bad");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = input;
    setInput("");
    calistir(v);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx); setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(idx); setInput(history[idx]); }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const eslesme = KOMUTLAR.find(k => k.startsWith(input));
      if (eslesme) setInput(eslesme + " ");
    }
  }

  return (
    <div className="card overflow-hidden flex flex-col lg:h-[560px]">
      <PanelHeader
        title="İşlem akışı"
        meta={`${rows.length} kayıt`}
        action={
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className={cn("absolute inset-0 rounded-full", canli ? "bg-good" : "bg-white/30")} />
              {canli && <span className="absolute inset-0 rounded-full bg-good animate-ping" />}
            </span>
            <span className="text-[10px] uppercase tracking-label opacity-70">{canli ? "canlı" : "beklemede"}</span>
          </span>
        }
      />

      <div className="flex items-center gap-1 px-3 py-2 border-b border-edge/50 overflow-x-auto shrink-0">
        <FilterIcon size={12} className="text-ink/40 shrink-0" />
        {(["tum", "basarili", "mukerrer", "bulunamadi", "cakisma"] as FiltreTip[]).map(t => {
          const info = t === "tum" ? null : TARAMA_DURUM[t];
          const sayi = t === "tum" ? rows.length : durumSayim[t];
          const secili = filtre === t;
          return (
            <button
              key={t}
              onClick={() => setFiltre(t)}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-mono font-semibold whitespace-nowrap transition-colors",
                secili ? FILTRE_AKTIF_CLS[info?.tone ?? "neutral"] : "text-ink/55 hover:bg-edge/25",
              )}
            >
              {t === "tum" ? "TÜM" : info?.label} <span className="opacity-60">{sayi}</span>
            </button>
          );
        })}
      </div>

      <div ref={cikisRef} className="flex-1 min-h-[220px] overflow-y-auto divide-y divide-edge/30">
        {items.length === 0 && (
          <div className="px-4 py-4 text-sm text-ink/55 font-mono">
            {filtre === "tum" ? "ilk tarama bekleniyor" : `${filtre} için kayıt yok`}
            <span className="inline-block w-2 h-3.5 ml-1 align-middle bg-ink/30 animate-caret" />
          </div>
        )}
        {items.map((it, i) => it.tip === "scan" ? (
          <button
            key={it.id}
            onClick={() => onSec?.(it.row)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-cream/60 transition-colors",
              i === 0 && it.ts > now - 800 && "bg-good/10",
            )}
          >
            <span className="font-mono text-[11px] text-ink/45 shrink-0">[{saatFormat(it.ts)}]</span>
            <StatusBadge
              label={TARAMA_DURUM[it.row.durum]?.label ?? it.row.durum.slice(0, 3).toUpperCase()}
              tone={TARAMA_DURUM[it.row.durum]?.tone ?? "neutral"}
              className="shrink-0 w-11"
            />
            <span className="font-mono text-[13px] font-semibold truncate">{it.row.seri_giris}</span>
            {it.row.stok_kodu && (
              <span className="font-mono text-[11px] text-ink/60 bg-edge/25 rounded px-1.5 py-0.5 shrink-0">
                {it.row.stok_kodu}
              </span>
            )}
            {it.row.urun_adi && (
              <span className="text-[12px] text-ink/55 truncate hidden sm:inline">{it.row.urun_adi}</span>
            )}
            {it.row.kullanici_ad && (
              <span
                className="ml-auto inline-flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: kullaniciRengi(it.row.kullanici_ad) }}
                title={it.row.kullanici_ad}
              >
                {it.row.kullanici_ad.slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        ) : (
          <div key={it.id} className={cn("px-3 py-1.5 font-mono text-[12px] whitespace-pre-wrap break-words", CMD_TONE_CLS[it.tone])}>
            {it.lines.map((l, li) => <div key={li}>{l}</div>)}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-edge/50 px-3 py-2 shrink-0">
        <span className="font-mono text-ink/40 shrink-0">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          placeholder="komut: tara, bul, ozet…"
          className="flex-1 bg-transparent outline-none font-mono text-[13px] placeholder:text-ink/35"
        />
      </form>
    </div>
  );
}

export default memo(_IslemAkisi);
