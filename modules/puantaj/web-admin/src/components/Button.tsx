import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'border-transparent bg-brand-600 text-white shadow-sm hover:bg-brand-500',
  secondary: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50',
  success: 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50',
  ghost: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100',
}

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  )
}
