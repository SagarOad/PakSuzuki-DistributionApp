import { useEffect, useState } from 'react'
import { ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'

export type GalleryImage = { id: string; storageUrl: string; fileName?: string }

type Props = {
  images: GalleryImage[]
  emptyText?: string
  /** How many placeholder tiles to show when there are no images. */
  placeholders?: number
  className?: string
}

/** Thumbnail grid of uploaded photos with a full-size viewer. */
export default function ImageGallery({
  images,
  emptyText = 'No photos uploaded.',
  placeholders = 4,
  className = 'grid-cols-4'
}: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    if (openIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null)
      if (e.key === 'ArrowRight') setOpenIndex((i) => (i === null ? i : (i + 1) % images.length))
      if (e.key === 'ArrowLeft') setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, images.length])

  if (images.length === 0) {
    return (
      <div>
        <div className={`grid gap-2 ${className}`}>
          {Array.from({ length: placeholders }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-suzuki-line bg-suzuki-mist flex items-center justify-center"
            >
              <ImageIcon size={18} className="text-suzuki-mute" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-suzuki-mute">{emptyText}</p>
      </div>
    )
  }

  const current = openIndex === null ? null : images[openIndex]

  return (
    <>
      <div className={`grid gap-2 ${className}`}>
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="aspect-square overflow-hidden rounded-lg border border-suzuki-line bg-suzuki-mist transition-transform hover:-translate-y-0.5"
            title={image.fileName || 'View photo'}
          >
            <img
              src={image.storageUrl}
              alt={image.fileName || `Photo ${index + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))
                }}
                className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Previous photo"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenIndex((i) => (i === null ? i : (i + 1) % images.length))
                }}
                className="absolute right-4 top-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Next photo"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={current.storageUrl}
              alt={current.fileName || 'Photo'}
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            <figcaption className="mt-3 text-center text-xs text-white/70">
              {current.fileName} · {(openIndex ?? 0) + 1} of {images.length}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
