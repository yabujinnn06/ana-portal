import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";

type Props = { onSubmit: (deger: string) => void; aktif?: boolean; busy?: boolean; pauseFocus?: boolean };

export default function BarkodInput({ onSubmit, aktif = true, busy = false, pauseFocus = false }: Props) {
  const [val, setVal] = useState("");
  const [focused, setFocused] = useState(true);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aktif && !pauseFocus) ref.current?.focus({ preventScroll: true });
  }, [aktif, pauseFocus]);

  useEffect(() => {
    if (!aktif || pauseFocus) return;
    const tut = () => {
      const act = document.activeElement;
      if (act && act !== ref.current && (
        act.tagName === "INPUT" || act.tagName === "TEXTAREA" || act.tagName === "SELECT" ||
        act.tagName === "VIDEO" || act.tagName === "BUTTON" ||
        (act as HTMLElement).isContentEditable
      )) return;
      if (act !== ref.current) ref.current?.focus({ preventScroll: true });
    };
    const t = setInterval(tut, 2000);
    return () => clearInterval(t);
  }, [aktif, pauseFocus]);

  function handle(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = val.trim();
    if (!v) return;
    onSubmit(v);
    setVal("");
    ref.current?.focus({ preventScroll: true });
  }

  function temizle() {
    setVal("");
    ref.current?.focus({ preventScroll: true });
  }

  return (
    <form onSubmit={handle} className="space-y-1.5">
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-xl bg-card",
          "border-2 transition-all duration-150",
          focused ? "border-accent shadow-e1 ring-4 ring-deep/10" : "border-edge",
          !aktif && "opacity-60",
        )}
      >
        <div className="pl-4 flex items-center pointer-events-none">
          <ScanLine size={22} className={cn("transition-colors", focused ? "text-accent" : "text-ink/40")} />
        </div>
        <input
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Barkod veya seri numarası"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          className="flex-1 px-4 py-4 text-xl sm:text-2xl font-mono tracking-wider bg-transparent outline-none placeholder:text-ink/35 uppercase"
          disabled={!aktif}
        />
        {val && !busy && (
          <button
            type="button"
            onClick={temizle}
            tabIndex={-1}
            title="Temizle"
            className="px-2 flex items-center text-ink/35 hover:text-ink/70 transition-colors"
          >
            <X size={18} />
          </button>
        )}
        <Button
          type="submit"
          variant="accent"
          disabled={!aktif || busy}
          className="h-auto px-7 tracking-wider rounded-none text-base"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : "TARA"}
        </Button>
      </div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-label text-ink/45 px-1">
        <span>{aktif ? "USB okuyucu: okut, Enter otomatik" : "Oturum kapalı — tarama yapılamaz"}</span>
        {aktif && <span className="hidden sm:inline font-mono normal-case">F2 = buraya odaklan</span>}
      </div>
    </form>
  );
}
