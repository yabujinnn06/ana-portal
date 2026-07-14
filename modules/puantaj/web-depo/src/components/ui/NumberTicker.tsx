import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";

type Props = { value: number; className?: string; duration?: number };

export default function NumberTicker({ value, className, duration = 600 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, margin: "-20%" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { damping: 24, stiffness: 110, mass: 0.6 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString("tr-TR"));

  useEffect(() => {
    if (inView) mv.set(value);
    else mv.set(value);
  }, [inView, value, mv]);

  return (
    <motion.span ref={ref} className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  );
}
