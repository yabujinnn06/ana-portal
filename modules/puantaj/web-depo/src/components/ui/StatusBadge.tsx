import { cn } from "../../lib/cn";

export type StatusTone = "good" | "warn" | "bad" | "neutral";

const TONE_CLS: Record<StatusTone, string> = {
  good: "bg-good/15 text-good-ink border-good/40",
  warn: "bg-warn/15 text-warn-ink border-warn/40",
  bad: "bg-bad/15 text-bad-ink border-bad/40",
  neutral: "bg-edge/20 text-ink/60 border-edge",
};

const DOT_CLS: Record<StatusTone, string> = {
  good: "bg-good",
  warn: "bg-warn-ink",
  bad: "bg-bad",
  neutral: "bg-ink/40",
};

export default function StatusBadge({
  label, tone, className,
}: { label: string; tone: StatusTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-mono text-[11px] font-semibold px-1.5 py-0.5 leading-none",
        TONE_CLS[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLS[tone])} />
      {label}
    </span>
  );
}

export const TARAMA_DURUM: Record<string, { label: string; tone: StatusTone }> = {
  basarili: { label: "OK", tone: "good" },
  mukerrer: { label: "MÜK", tone: "warn" },
  bulunamadi: { label: "YOK", tone: "bad" },
  cakisma: { label: "ÇAK", tone: "warn" },
};

export const OTURUM_DURUM: Record<string, { label: string; tone: StatusTone }> = {
  aktif: { label: "AKTİF", tone: "good" },
  tamamlandi: { label: "TAMAMLANDI", tone: "neutral" },
  arsiv: { label: "ARŞİV", tone: "neutral" },
  silindi: { label: "SİLİNDİ", tone: "bad" },
};
