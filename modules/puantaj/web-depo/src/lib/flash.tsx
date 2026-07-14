import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Tam ekran tarama geri bildirimi: depoda ekrana bakmadan, goz ucuyla
// sonucu gormek icin kisa renk flasi. HEV-ekrani hissi.

export type FlashTone = "good" | "warn" | "bad";

type FlashEvent = { key: number; tone: FlashTone };

let listener: ((e: FlashEvent) => void) | null = null;
let seq = 1;

export function flash(tone: FlashTone) {
  listener?.({ key: seq++, tone });
}

const TONE_BG: Record<FlashTone, string> = {
  good: "rgba(95,190,122,0.55)",
  warn: "rgba(244,177,131,0.55)",
  bad: "rgba(220,90,90,0.6)",
};

const TONE_EDGE: Record<FlashTone, string> = {
  good: "#5FBE7A",
  warn: "#F4B183",
  bad: "#DC5A5A",
};

export function FlashOverlay() {
  const [ev, setEv] = useState<FlashEvent | null>(null);

  useEffect(() => {
    listener = setEv;
    return () => { listener = null; };
  }, []);

  return (
    <AnimatePresence>
      {ev && (
        <motion.div
          key={ev.key}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          onAnimationComplete={() => setEv(e => (e?.key === ev.key ? null : e))}
          className="fixed inset-0 z-[90] pointer-events-none"
          style={{
            background: `radial-gradient(140% 140% at 50% 100%, ${TONE_BG[ev.tone]} 0%, transparent 55%)`,
            boxShadow: `inset 0 0 0 4px ${TONE_EDGE[ev.tone]}`,
          }}
        />
      )}
    </AnimatePresence>
  );
}
