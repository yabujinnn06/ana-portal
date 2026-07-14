/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: 'var(--ed-ink)',
        paper: 'var(--ed-paper)',
        cream: 'var(--ed-cream)',
        rule: 'var(--ed-rule)',
        accent: {
          DEFAULT: 'var(--ed-accent)',
          soft: 'var(--ed-accent-soft)',
        },
        cyan: {
          DEFAULT: 'var(--ed-cyan)',
        },
        ok: 'var(--ed-ok)',
        warn: 'var(--ed-warn)',
        err: 'var(--ed-err)',
      },
      animation: {
        'shine': 'shine var(--shine-duration, 8s) infinite linear',
        'fade-up': 'fade-up 220ms ease-out both',
        'flip-top': 'flip-top 0.28s cubic-bezier(0.55, 0.05, 0.6, 0.4) forwards',
        'flip-bottom': 'flip-bottom 0.28s cubic-bezier(0.3, 0.6, 0.45, 0.95) 0.28s forwards',
        'rain-drop': 'rain-drop 2.5s ease-in infinite',
        'breath': 'breath 3.4s ease-in-out infinite',
        'soft-float': 'soft-float 6s ease-in-out infinite',
      },
      keyframes: {
        shine: {
          '0%': { 'background-position': '0% 0%' },
          '50%': { 'background-position': '100% 100%' },
          '100%': { 'background-position': '0% 0%' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'flip-top': {
          '0%': { transform: 'rotateX(0deg)' },
          '100%': { transform: 'rotateX(-90deg)' },
        },
        'flip-bottom': {
          '0%': { transform: 'rotateX(90deg)' },
          '100%': { transform: 'rotateX(0deg)' },
        },
        'rain-drop': {
          '0%': { transform: 'translateY(-10%)', opacity: '0' },
          '15%': { opacity: '0.5' },
          '85%': { opacity: '0.4' },
          '100%': { transform: 'translateY(110%)', opacity: '0' },
        },
        breath: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.15)', opacity: '1' },
        },
        'soft-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
      },
    },
  },
  plugins: [],
}
