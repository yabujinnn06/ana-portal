// Mevcut acilis (boot loader) YABUJIN logosunun yeniden kullanilabilir,
// olceklenebilir hali. Ayni CSS animasyonlarini (orbit/satellite/ring) kullanir.
interface YabujinSpinnerProps {
  size?: number
  className?: string
}

export function YabujinSpinner({ size = 92, className }: YabujinSpinnerProps) {
  return (
    <div
      className={`yabujin-spinner${className ? ` ${className}` : ''}`}
      style={{ ['--yj-size' as string]: `${size}px`, ['--yj-scale' as string]: String(size / 296) }}
      aria-hidden="true"
    >
      <div className="employee-boot-loader-stage">
        <div className="employee-boot-loader-shadow" />
        <div className="employee-boot-loader-nebula employee-boot-loader-nebula--back" />
        <div className="employee-boot-loader-nebula employee-boot-loader-nebula--front" />
        <div className="employee-boot-loader-aura" />
        <div className="employee-boot-loader-orbit employee-boot-loader-orbit--outer" />
        <div className="employee-boot-loader-orbit employee-boot-loader-orbit--mid" />
        <div className="employee-boot-loader-orbit employee-boot-loader-orbit--inner" />
        <div className="employee-boot-loader-orbit employee-boot-loader-orbit--polar" />
        <div className="employee-boot-loader-satellite employee-boot-loader-satellite--outer">
          <div className="employee-boot-loader-satellite-core" />
        </div>
        <div className="employee-boot-loader-satellite employee-boot-loader-satellite--mid">
          <div className="employee-boot-loader-satellite-core" />
        </div>
        <div className="employee-boot-loader-satellite employee-boot-loader-satellite--inner">
          <div className="employee-boot-loader-satellite-core" />
        </div>
        <div className="employee-boot-loader-logo">
          <div className="employee-boot-loader-logo-depth" />
          <div className="employee-boot-loader-logo-halo" />
          <div className="employee-boot-loader-ring employee-boot-loader-ring--back" />
          <div className="employee-boot-loader-core">
            <span className="employee-boot-loader-monogram">Y</span>
          </div>
          <div className="employee-boot-loader-ring employee-boot-loader-ring--front" />
          <div className="employee-boot-loader-spark employee-boot-loader-spark--a" />
          <div className="employee-boot-loader-spark employee-boot-loader-spark--b" />
        </div>
      </div>
    </div>
  )
}
