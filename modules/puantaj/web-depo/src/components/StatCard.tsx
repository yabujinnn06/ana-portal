import { motion } from "framer-motion";
import NumberTicker from "./ui/NumberTicker";
import ProgressBar from "./ui/ProgressBar";
import { cn } from "../lib/cn";

type Props = {
  etiket: string;
  deger: number;
  toplam?: number;
  tone?: "deep" | "good" | "warn" | "accent";
  icon?: React.ReactNode;
  hint?: string;
};

const toneText: Record<NonNullable<Props["tone"]>, string> = {
  deep: "text-accent",
  good: "text-good-ink",
  warn: "text-warn-ink",
  accent: "text-accent",
};

const toneRail: Record<NonNullable<Props["tone"]>, string> = {
  deep: "bg-deep/30",
  good: "bg-good",
  warn: "bg-warn",
  accent: "bg-accent",
};

export default function StatCard({ etiket, deger, toplam, tone = "deep", icon, hint }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative card p-4 pl-5 overflow-hidden"
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", toneRail[tone])} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-label text-ink/60 font-medium">{etiket}</div>
        {icon && <div className={cn("opacity-70", toneText[tone])}>{icon}</div>}
      </div>
      <div className={cn("font-semibold text-[28px] mt-1 leading-none tabular-nums", toneText[tone])}>
        <NumberTicker value={deger} />
      </div>
      {hint && <div className="text-[11px] text-ink/55 mt-1">{hint}</div>}
      {typeof toplam === "number" && toplam > 0 && (
        <div className="mt-3">
          <ProgressBar value={deger} max={toplam} tone={tone === "deep" ? "accent" : tone} height={5} />
          <div className="text-[10px] text-ink/55 mt-1 font-mono">
            {Math.round((deger / toplam) * 100)}% · {deger}/{toplam}
          </div>
        </div>
      )}
    </motion.div>
  );
}
