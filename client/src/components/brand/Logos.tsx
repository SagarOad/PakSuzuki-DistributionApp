/** Brand marks — official Suzuki / ECSTAR assets from public/brand. */

type LogoVariant = 'navbar' | 'light'

const SUZUKI_NAVBAR = '/brand/suzuki-navbar.png'
const SUZUKI_WHITE = '/brand/suzuki-white.png'
const ECSTAR_NAVBAR = '/brand/ecstar-navbar.png'

export function SuzukiLogo({
  className = 'h-9',
  variant = 'navbar'
}: {
  className?: string
  variant?: LogoVariant
}) {
  const src = variant === 'light' ? SUZUKI_WHITE : SUZUKI_NAVBAR
  return (
    <img
      src={src}
      alt="Suzuki"
      className={`w-auto object-contain object-left ${className}`}
    />
  )
}

export function EcstarLogo({
  className = 'h-10'
}: {
  className?: string
}) {
  return (
    <img
      src={ECSTAR_NAVBAR}
      alt="ECSTAR Genuine Oil & Chemical"
      className={`w-auto object-contain object-right ${className}`}
    />
  )
}

/** Login / forget-password header: white Suzuki mark on dark backdrop. */
export function BrandPair({ variant = 'light' }: { variant?: LogoVariant }) {
  if (variant === 'light') {
    return (
      <div className="flex items-center">
        <SuzukiLogo variant="light" className="h-11 sm:h-12" />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <SuzukiLogo variant="navbar" className="h-9" />
      <EcstarLogo className="h-9" />
    </div>
  )
}
