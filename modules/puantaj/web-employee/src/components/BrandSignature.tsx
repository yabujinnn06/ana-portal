import { UI_BRANDING } from '../config/ui'

export function BrandSignature() {
  return (
    <div className="mt-6 w-full rounded-2xl border border-rule bg-paper px-4 py-3 shadow-[0_8px_24px_rgba(15,44,61,0.06)]">
      <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:gap-3">
        {/* Sol: konum ikonu + nokta deseni */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.686 7-11a7 7 0 10-14 0c0 5.314 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.3" />
            </svg>
          </span>
          <span aria-hidden="true" className="hidden grid-cols-3 gap-[3px] sm:grid">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} className="h-1 w-1 rounded-full bg-accent/30" />
            ))}
          </span>
          <span aria-hidden="true" className="hidden h-7 w-px bg-rule sm:block" />
        </div>

        {/* Orta: KVKK konum notu */}
        <p className="min-w-0 flex-1 text-center font-sans text-xs font-semibold text-ink/80 sm:text-sm">
          Konumunuz, izin verdiğiniz ölçüde mesai işlemleri için kullanılmaktadır.
        </p>

        {/* Sag: surum rozeti */}
        {UI_BRANDING.showSignature ? (
          <div className="flex shrink-0 items-center gap-3">
            <span aria-hidden="true" className="hidden h-8 w-px bg-rule sm:block" />
            <div className="text-center leading-tight sm:text-right">
              <span className="block whitespace-nowrap font-mono text-[0.62rem] font-semibold tracking-tight text-ink/45">
                <span className="text-ink/30">{'</>'}</span> {UI_BRANDING.signatureText.toLowerCase()}.dev
                <span className="mx-1.5 text-accent">•</span>
                <span className="font-sans font-bold uppercase tracking-[0.16em] text-accent">GÜNCEL</span>
              </span>
              <span className="mt-0.5 block whitespace-nowrap font-sans text-[0.58rem] tracking-wide text-ink/40">
                Main Developer · <span className="font-semibold text-ink/60">Hüseyincan Orman</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
