import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export default function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 mb-3", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-label text-ink/55 whitespace-nowrap">
        {children}
      </span>
      <span className="h-px flex-1 bg-edge/60" />
    </div>
  );
}
