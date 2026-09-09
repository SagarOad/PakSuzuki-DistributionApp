/** Official Suzuki mark used when an upload/image URL is missing. */
export const SUZUKI_PLACEHOLDER = '/brand/suzuki-placeholder.png'

type Props = {
  src?: string | null
  alt?: string
  className?: string
  imgClassName?: string
}

/** Renders an image, or the Suzuki logo placeholder when src is empty/broken. */
export default function PlaceholderImage({
  src,
  alt = '',
  className = 'bg-white',
  imgClassName = 'h-full w-full object-contain p-2'
}: Props) {
  const url = src?.trim() || SUZUKI_PLACEHOLDER
  return (
    <div className={`overflow-hidden flex items-center justify-center ${className}`}>
      <img
        src={url}
        alt={alt}
        className={imgClassName}
        onError={(e) => {
          const el = e.currentTarget
          if (el.src.endsWith(SUZUKI_PLACEHOLDER)) return
          el.src = SUZUKI_PLACEHOLDER
        }}
      />
    </div>
  )
}
