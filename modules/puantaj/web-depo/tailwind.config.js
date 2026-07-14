/** @type {import('tailwindcss').Config} */
// GoldSrc / eski Steam (CS 1.6) temasi: oliv-haki paneller, bevel kenarlar, amber vurgu
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#D8DED3",
        cream: "#3A4233",
        card: "#4C5844",
        edge: "#2A3123",
        field: "#333B2B",
        accent: "#C08A30",
        deep: "#333B2B",
        deeper: "#262C20",
        flame: { DEFAULT: "#D97328", ink: "#E8A33D" },
        good: { DEFAULT: "#6FAE4A", ink: "#A8C060" },
        warn: { DEFAULT: "#D99A3A", ink: "#E0B23C" },
        bad: { DEFAULT: "#C0513B", ink: "#E06C55" },
      },
      fontFamily: {
        display: ["Verdana", "Tahoma", '"Segoe UI"', "sans-serif"],
        body: ["Verdana", "Tahoma", '"Segoe UI"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        label: "0.08em",
      },
      boxShadow: {
        e0: "0 1px 2px rgba(0,0,0,.25)",
        e1: "0 4px 12px -4px rgba(0,0,0,.4)",
        e2: "0 16px 40px -12px rgba(0,0,0,.55)",
        panel: "0 1px 0 rgba(255,255,255,.06) inset, 0 2px 6px rgba(0,0,0,.3)",
        lift: "0 1px 0 rgba(255,255,255,.08) inset, 0 8px 24px -10px rgba(0,0,0,.5)",
        focusring: "0 0 0 3px rgba(192,138,48,.25)",
      },
      animation: {
        "caret": "caret 1s steps(1) infinite",
      },
      keyframes: {
        "caret": {
          "0%,49%":  { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
