import { Smartphone, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/context/authStore'
import { SuzukiLogo } from '@/components/brand/Logos'

/** Retailers use the mobile app — web portal is for staff / distributors only. */
export default function MobileAppOnlyPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const userName = useAuthStore((s) => s.userName)

  function signOut() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-suzuki-mist flex flex-col">
      <header className="bg-white border-b border-suzuki-line px-6 py-4 flex items-center justify-between">
        <SuzukiLogo className="h-9" />
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 text-sm font-semibold text-suzuki-mute hover:text-suzuki-red"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-suzuki-line shadow-card p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-suzuki-ice text-suzuki-navy">
            <Smartphone size={32} strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Use the mobile app</h1>
          <p className="mt-3 text-sm text-suzuki-mute leading-relaxed">
            {userName ? (
              <>
                Signed in as <span className="font-semibold text-suzuki-ink">{userName}</span>.
                {' '}
              </>
            ) : null}
            Retailer accounts are managed in the <strong className="text-suzuki-ink">Pak Suzuki</strong> mobile
            app — ordering, claims, and shop features are not available on this web portal.
          </p>
          <p className="mt-4 text-sm text-suzuki-mute leading-relaxed">
            Open the app on your phone and sign in with the same email and password.
            If you need help, contact your distributor or Pakistan Suzuki support.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-8 w-full rounded-xl bg-suzuki-red py-3.5 text-sm font-bold text-white hover:bg-[#c50511]"
          >
            Back to login
          </button>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-suzuki-mute">
        © Copyright {new Date().getFullYear()} Pakistan Suzuki
      </footer>
    </div>
  )
}
