import { motion } from "framer-motion";
import { cn } from "../../lib/cn";

type Props = {
  value: number;
  max: number;
  className?: string;
  height?: number;
  tone?: "good" | "warn" | "accent";
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  good: "from-good/70 to-good",
  warn: "from-warn/70 to-warn",
  accent: "from-accent/60 to-accent",
};

export default function ProgressBar({ value, max, className, height = 6, tone = "accent" }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={cn("relative w-full rounded-full bg-edge/40 overflow-hidden", className)}
      style={{ height }}
    >
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-r", toneClass[tone])}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", damping: 22, stiffness: 140 }}
      />
    </div>
  );
}
