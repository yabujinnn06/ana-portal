import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export default function PanelHeader({
  title, meta, action, className,
}: { title: string; meta?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-2.5 surface-deep text-white rounded-t-xl", className)}>
      <span className="text-[13px] font-semibold uppercase tracking-label truncate">{title}</span>
      <div className="flex items-center gap-3 shrink-0">
        {meta && <span className="font-mono text-xs opacity-70">{meta}</span>}
        {action}
      </div>
    </div>
  );
}
