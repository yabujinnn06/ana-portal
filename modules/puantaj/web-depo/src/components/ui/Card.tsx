import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export default function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[14px] bg-card border border-edge shadow-panel transition-shadow", className)}>
      {children}
    </div>
  );
}
