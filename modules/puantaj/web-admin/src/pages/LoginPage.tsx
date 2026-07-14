import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { parseApiError, type ParsedApiError } from '../api/error'
import { LoginCanvasBackground } from '../components/LoginCanvasBackground'
import { UI_BRANDING } from '../config/ui'
import { useAuth } from '../hooks/useAuth'
import { runWithSystemTransition } from '../lib/systemTransition'

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adi gerekli.'),
  password: z.string().min(1, 'Şifre gerekli.'),
  mfaCode: z.string().optional(),
  mfaRecoveryCode: z.string().optional(),
})

function getErrorTitle(error: ParsedApiError): string {
  if (error.code === 'INVALID_CREDENTIALS') {
    return 'Giriş bilgileri hatali'
  }

  if (error.code === 'MFA_REQUIRED') {
    return 'MFA kodu gerekli'
  }

  if (error.code === 'INVALID_MFA_CODE') {
    return 'MFA kodu geçersiz'
  }

  if (error.code === 'MFA_SETUP_REQUIRED') {
    return 'MFA kurulumu gerekli'
  }

  if (error.code === 'TOO_MANY_ATTEMPTS') {
    return 'Çok fazla deneme'
  }

  if (error.code === 'INTERNAL_ERROR') {
    return 'Sunucu hatası'
  }

  return 'Giriş başarısız'
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRecoveryCode, setMfaRecoveryCode] = useState('')
  const [error, setError] = useState<ParsedApiError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const target = useMemo(() => {
    const stateTarget = (location.state as { from?: string } | undefined)?.from
    const searchTarget = new URLSearchParams(location.search).get('redirect')
    return stateTarget ?? searchTarget ?? '/log'
  }, [location.search, location.state])

  const adminLogoUrl = `${import.meta.env.BASE_URL}admin-logo.svg`

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ username, password, mfaCode, mfaRecoveryCode })
    if (!parsed.success) {
      setError({ message: parsed.error.issues[0]?.message ?? 'Form alanlarini kontrol et.' })
      return
    }

    setIsSubmitting(true)
    try {
      await login(
        parsed.data.username,
        parsed.data.password,
        parsed.data.mfaCode,
        parsed.data.mfaRecoveryCode,
      )
      await runWithSystemTransition('enter', 'Sisteme giriş yapılıyor...', () => {
        navigate(target, { replace: true })
      })
    } catch (submitError) {
      setError(parseApiError(submitError, 'Giriş başarısız.'))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="admin-login-screen">
      <LoginCanvasBackground />
      <main className="admin-login-shell">
        <section className="admin-login-hero" aria-hidden="true">
          <div className="admin-login-hero-inner">
            <div className="admin-login-brand">
              <img src={adminLogoUrl} alt="" width={46} height={46} />
              <span className="admin-login-wordmark">
                Puantaj<span className="admin-login-wordmark-sub">RW</span>
              </span>
            </div>
            <h2 className="admin-login-hero-title">
              Yoklama, vardiya ve bordro tek panelde.
            </h2>
            <p className="admin-login-hero-text">
              Giriş/çıkış takibi, izin yönetimi, özlük ve bordro işlemlerini tek yerden yönet.
              Puantaj Zeka asistanı ile saniyeler içinde rapor al.
            </p>
            <div className="admin-login-hero-badges">
              <span className="admin-login-hero-badge">Yoklama</span>
              <span className="admin-login-hero-badge">Bordro</span>
              <span className="admin-login-hero-badge">Özlük</span>
              <span className="admin-login-hero-badge">Puantaj Zeka</span>
            </div>
          </div>
        </section>

        <section className="admin-login-main">
          <div className="admin-login-card">
            <div className="admin-login-card-brand">
              <img src={adminLogoUrl} alt="Puantaj" width={38} height={38} />
              <span className="admin-login-wordmark">
                Puantaj<span className="admin-login-wordmark-sub">RW</span>
              </span>
            </div>
            <h1 className="admin-login-title">Admin Giriş</h1>
            <p className="admin-login-subtitle">Puantaj yönetim paneline giriş yap.</p>

            <form onSubmit={onSubmit} className="admin-login-form" noValidate>
              <label className="admin-login-field">
                <span>Kullanıcı Adı</span>
                <input
                  name="username"
                  autoComplete="username"
                  required
                  autoFocus
                  placeholder="kullanici.adi"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>

              <label className="admin-login-field">
                <span>Şifre</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Şifren"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <div className="admin-login-optional-fields">
                <label className="admin-login-field">
                  <span>
                    MFA Kodu <span className="admin-login-field-hint">(gerekliyse)</span>
                  </span>
                  <input
                    name="mfaCode"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    placeholder="6 haneli kod"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                  />
                </label>

                <label className="admin-login-field">
                  <span>
                    Kurtarma Kodu <span className="admin-login-field-hint">(MFA cihazın yoksa)</span>
                  </span>
                  <input
                    name="mfaRecoveryCode"
                    autoComplete="off"
                    placeholder="Örnek: ABCDE-FGHIJ"
                    value={mfaRecoveryCode}
                    onChange={(event) => setMfaRecoveryCode(event.target.value)}
                  />
                </label>
              </div>

              {error ? (
                <div className="admin-login-error" role="alert">
                  <p className="admin-login-error-title">{getErrorTitle(error)}</p>
                  <p>{error.message}</p>
                  {error.requestId ? (
                    <p className="admin-login-error-request-id">request_id: {error.requestId}</p>
                  ) : null}
                </div>
              ) : null}

              <button type="submit" disabled={isSubmitting} className="admin-login-submit">
                {isSubmitting ? (
                  <>
                    <span className="inline-spinner" aria-hidden="true" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  'Giriş Yap'
                )}
              </button>
            </form>

            {UI_BRANDING.showSignature ? (
              <p className="admin-login-signature">
                {UI_BRANDING.signatureText} | BUILD: {UI_BRANDING.buildVersion}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
