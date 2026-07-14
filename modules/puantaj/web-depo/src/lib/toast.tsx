import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, XCircle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "./cn";

type Tip = "ok" | "warn" | "err" | "info";
type Toast = { id: number; tip: Tip; mesaj: string };

const cfg: Record<Tip, { icon: any; ring: string; bg: string; ikonRenk: string }> = {
  ok:   { icon: CheckCircle2, ring: "ring-good/40",  bg: "bg-good/10",  ikonRenk: "text-good-ink" },
  warn: { icon: AlertCircle,  ring: "ring-warn/50",  bg: "bg-warn/15",  ikonRenk: "text-warn-ink" },
  err:  { icon: XCircle,      ring: "ring-bad/40",   bg: "bg-bad/10",   ikonRenk: "text-bad-ink" },
  info: { icon: Info,         ring: "ring-deep/30",  bg: "bg-deep/10",  ikonRenk: "text-accent" },
};

type Ctx = { push: (tip: Tip, mesaj: string, sure?: number) => void };
const C = createContext<Ctx>({ push: () => {} });

let seq = 1;

export function ToastSaglayici({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);

  const push = useCallback((tip: Tip, mesaj: string, sure = 4000) => {
    const id = seq++;
    setList((s) => [...s, { id, tip, mesaj }]);
    setTimeout(() => setList((s) => s.filter(t => t.id !== id)), sure);
  }, []);

  function kapat(id: number) { setList(s => s.filter(t => t.id !== id)); }

  const ctx = useMemo(() => ({ push }), [push]);

  return (
    <C.Provider value={ctx}>
      {children}
      <div className="fixed top-3 right-3 left-3 sm:left-auto z-[80] flex flex-col gap-2 sm:max-w-sm pointer-events-none">
        <AnimatePresence>
          {list.map(t => {
            const c = cfg[t.tip];
            const Icon = c.icon;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "pointer-events-auto card flex items-start gap-2 px-3 py-2.5 ring-1 shadow-lg",
                  c.bg, c.ring,
                )}
              >
                <Icon size={16} className={cn("mt-0.5 shrink-0", c.ikonRenk)} />
                <div className="text-sm flex-1">{t.mesaj}</div>
                <button onClick={() => kapat(t.id)}
                  className="text-ink/40 hover:text-ink p-0.5">
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </C.Provider>
  );
}

export function useToast() { return useContext(C); }
