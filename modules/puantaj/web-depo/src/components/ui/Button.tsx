import { ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../../lib/cn";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "danger" | "accent" | "quiet";
  size?: "sm" | "md";
}

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-deep text-white shadow-lift hover:bg-deeper hover:-translate-y-px",
  secondary: "bg-card text-ink border border-edge shadow-e0 hover:border-accent/30 hover:bg-cream/60",
  danger: "bg-bad text-white shadow-e1 hover:bg-bad/90 hover:-translate-y-px",
  accent: "bg-accent text-white shadow-e1 hover:bg-accent/90 hover:-translate-y-px",
  quiet: "bg-transparent text-ink/60 hover:bg-edge/30 hover:text-ink",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-semibold rounded-[10px] transition duration-150",
          "active:translate-y-px disabled:opacity-60 disabled:pointer-events-none disabled:translate-y-0",
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
