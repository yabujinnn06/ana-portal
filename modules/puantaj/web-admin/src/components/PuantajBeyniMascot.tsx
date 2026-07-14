// YABUJIN acilis loaderinin (welcome-hero-logo) yeniden olceklenebilir hali.
// Puantaj Beyni maskotu: ayni yorunge/uydu/halka animasyonu, cekirdekte beyin.
interface PuantajBeyniMascotProps {
  size?: number
  className?: string
  /** true ise yorunge/uydu animasyonlari durur (sadece hafif suzulme kalir) */
  calm?: boolean
}

export function PuantajBeyniMascot({ size = 96, className, calm = false }: PuantajBeyniMascotProps) {
  return (
    <div
      className={`pb-mascot${calm ? ' pb-mascot--calm' : ''}${className ? ` ${className}` : ''}`}
      style={{ ['--pb-size' as string]: `${size}px`, ['--pb-scale' as string]: String(size / 296) }}
      aria-hidden="true"
    >
      <div className="welcome-hero-logo">
        <div className="welcome-hero-logo__shadow" />
        <div className="welcome-hero-logo__nebula welcome-hero-logo__nebula--back" />
        <div className="welcome-hero-logo__nebula welcome-hero-logo__nebula--front" />
        <div className="welcome-hero-logo__aura" />
        <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--outer" />
        <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--mid" />
        <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--inner" />
        <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--polar" />
        <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--outer">
          <div className="welcome-hero-logo__satellite-core" />
        </div>
        <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--mid">
          <div className="welcome-hero-logo__satellite-core" />
        </div>
        <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--inner">
          <div className="welcome-hero-logo__satellite-core" />
        </div>
        <div className="welcome-hero-logo__planet">
          <div className="welcome-hero-logo__depth" />
          <div className="welcome-hero-logo__halo" />
          <div className="welcome-hero-logo__ring welcome-hero-logo__ring--back" />
          <div className="welcome-hero-logo__core" />
          <div className="welcome-hero-logo__ring welcome-hero-logo__ring--front" />
          <div className="welcome-hero-logo__spark welcome-hero-logo__spark--a" />
          <div className="welcome-hero-logo__spark welcome-hero-logo__spark--b" />
        </div>
      </div>
    </div>
  )
}
