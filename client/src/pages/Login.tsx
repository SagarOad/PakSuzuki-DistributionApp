import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Mail, Lock, KeyRound } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuthStore, type UserRole } from '@/context/authStore'
import { BrandPair } from '@/components/brand/Logos'

type Mode = 'login' | 'forgot-email' | 'forgot-reset'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [mode, setMode] = useState<Mode>('login')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { userName, password })
      setAuth(data.token, data.userName, data.role as UserRole, {
        requiresCorrection: !!data.requiresCorrection,
        approvalRemarks: data.approvalRemarks ?? null,
        profileId: data.profileId ?? null
      })

      if (data.requiresCorrection) {
        navigate('/correct-registration')
        return
      }

      // Retailers order via mobile — do not open the staff web dashboard (avoids 403).
      if (data.role === 'Retailer') {
        navigate('/use-mobile-app', { replace: true })
        return
      }

      navigate('/')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError((err.response?.data?.title as string) || 'Invalid username or password.')
      } else {
        setError('Invalid username or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setDevOtp(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ accepted: boolean; devOtp?: string | null }>(
        '/auth/forgot-password',
        { userNameOrEmail: forgotEmail }
      )
      if (data.devOtp) setDevOtp(data.devOtp)

      setInfo(
        'If this account exists, a one-time code was sent to the registered email. ' +
          'Check your inbox, or open the latest file in the API email-outbox folder when testing locally.'
      )
      setMode('forgot-reset')
      setOtp('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError((err.response?.data?.title as string) || 'Could not process request. Try again.')
      } else {
        setError('Could not process request. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password-otp', {
        userNameOrEmail: forgotEmail,
        otp,
        newPassword
      })
      setInfo('Password updated. You can sign in with your new password.')
      setMode('login')
      setPassword('')
      setOtp('')
      setNewPassword('')
      setConfirmPassword('')
      setDevOtp(null)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          (err.response?.data?.title as string) ||
            (err.response?.data?.detail as string) ||
            'Invalid or expired code. Request a new one.'
        )
      } else {
        setError('Could not reset password. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function resendOtp() {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ accepted: boolean; devOtp?: string | null }>(
        '/auth/forgot-password',
        { userNameOrEmail: forgotEmail }
      )
      if (data.devOtp) setDevOtp(data.devOtp)
      setInfo('A new code was sent. Check email or the local email-outbox folder.')
    } catch {
      setError('Could not resend code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070B18] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[#070B18]" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-95 max-lg:opacity-40 max-lg:bg-center"
          style={{ backgroundImage: "url('/login-ecstar-oils.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070B18] via-[#070B18]/92 to-transparent max-lg:via-[#070B18]/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070B18]/80 via-transparent to-[#070B18]/30" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
          <div className="w-full max-w-md">
            <BrandPair variant="light" />

            <h1 className="mt-14 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {mode === 'login' ? 'Login' : 'Forget Password'}
            </h1>

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="mt-10 space-y-4">
                <Field
                  icon={<Mail size={18} className="text-suzuki-red" />}
                  type="email"
                  placeholder="Enter User ID"
                  autoComplete="username"
                  value={userName}
                  onChange={setUserName}
                  required
                />
                <Field
                  icon={<Lock size={18} className="text-suzuki-red" />}
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  required
                />

                {error && <p className="text-sm font-medium text-red-300 whitespace-pre-wrap">{error}</p>}
                {info && <p className="text-sm font-medium text-emerald-300 whitespace-pre-wrap">{info}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-suzuki-red py-3.5 text-base font-bold text-white
                             shadow-[0_10px_30px_rgba(227,6,19,0.35)] transition hover:bg-[#c50511] disabled:opacity-60"
                >
                  {loading ? 'Signing in…' : 'Login'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot-email')
                    setError(null)
                    setInfo(null)
                    setForgotEmail(userName)
                    setDevOtp(null)
                  }}
                  className="pt-1 text-left text-sm font-medium text-white/90 hover:text-white"
                >
                  Forget Password
                </button>

                <p className="pt-4 text-sm text-white/70">
                  New distributor?{' '}
                  <Link
                    to="/register/distributor"
                    className="font-semibold text-white underline underline-offset-2 hover:text-suzuki-sky"
                  >
                    Register here
                  </Link>
                </p>
              </form>
            )}

            {mode === 'forgot-email' && (
              <form onSubmit={handleForgotSendOtp} className="mt-10 space-y-4">
                <p className="text-sm text-white/70">
                  Enter your registered email. We will send a one-time code so you can set a new password.
                </p>
                <Field
                  icon={<Mail size={18} className="text-suzuki-red" />}
                  type="email"
                  placeholder="Enter User ID"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={setForgotEmail}
                  required
                />

                {error && <p className="text-sm font-medium text-red-300 whitespace-pre-wrap">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-suzuki-red py-3.5 text-base font-bold text-white
                             shadow-[0_10px_30px_rgba(227,6,19,0.35)] transition hover:bg-[#c50511] disabled:opacity-60"
                >
                  {loading ? 'Sending…' : 'Send code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setError(null)
                    setInfo(null)
                  }}
                  className="pt-1 text-left text-sm font-medium text-white/90 hover:text-white"
                >
                  Back to Login
                </button>
              </form>
            )}

            {mode === 'forgot-reset' && (
              <form onSubmit={handleForgotReset} className="mt-10 space-y-4">
                <p className="text-sm text-white/70">
                  Enter the code from your email, then choose a new password.
                </p>

                {info && <p className="text-sm font-medium text-emerald-300 whitespace-pre-wrap">{info}</p>}
                {devOtp && (
                  <p className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
                    Dev OTP (also in email-outbox): <span className="font-mono font-bold tracking-widest">{devOtp}</span>
                  </p>
                )}

                <Field
                  icon={<KeyRound size={18} className="text-suzuki-red" />}
                  type="text"
                  placeholder="One-time code"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={setOtp}
                  required
                />
                <Field
                  icon={<Lock size={18} className="text-suzuki-red" />}
                  type="password"
                  placeholder="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  required
                />
                <Field
                  icon={<Lock size={18} className="text-suzuki-red" />}
                  type="password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  required
                />

                {error && <p className="text-sm font-medium text-red-300 whitespace-pre-wrap">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-suzuki-red py-3.5 text-base font-bold text-white
                             shadow-[0_10px_30px_rgba(227,6,19,0.35)] transition hover:bg-[#c50511] disabled:opacity-60"
                >
                  {loading ? 'Updating…' : 'Reset password'}
                </button>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void resendOtp()}
                    className="text-left text-sm font-medium text-white/90 hover:text-white disabled:opacity-50"
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError(null)
                      setInfo(null)
                      setDevOtp(null)
                    }}
                    className="text-left text-sm font-medium text-white/90 hover:text-white"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <footer className="relative z-10 pb-6 text-center text-xs text-white/45">
          © Copyright {new Date().getFullYear()} Pakistan Suzuki
        </footer>
      </div>
    </div>
  )
}

function Field({
  icon,
  type,
  placeholder,
  value,
  onChange,
  required,
  autoComplete
}: {
  icon: React.ReactNode
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  autoComplete?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-suzuki-ink shadow-sm">
      <span className="shrink-0">{icon}</span>
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-suzuki-mute"
      />
    </div>
  )
}
