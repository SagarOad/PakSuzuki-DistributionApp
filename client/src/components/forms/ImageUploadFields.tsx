import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_BUSINESS_IMAGES = 8
const ALLOWED_TYPES = /^image\/(jpe?g|png|webp|heic|heif)$/i

/** Mirrors the server rules (ImageUploadRules) so users see problems before submitting. */
export function checkImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.test(file.type)) return `${file.name}: use a JPG, PNG, WEBP or HEIC image.`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: larger than 5 MB.`
  return null
}

type Props = {
  profileImage: File | null
  businessImages: File[]
  onProfileChange: (file: File | null) => void
  onBusinessChange: (files: File[]) => void
  /** Copy shown under the shop photos heading. */
  businessHint?: string
  /** Marks the shop photos as required (registration) or optional (corrections). */
  businessRequired?: boolean
}

/**
 * Camera / gallery pickers used by distributor and retailer registration. Files are sent as-is in
 * the multipart registration request — nothing here asks the user for a link.
 */
export default function ImageUploadFields({
  profileImage,
  businessImages,
  onProfileChange,
  onBusinessChange,
  businessHint = 'Shop front, signboard or interior. Helps Pak Suzuki verify your business.',
  businessRequired = true
}: Props) {
  const profileRef = useRef<HTMLInputElement>(null)
  const businessRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const profilePreview = useMemo(
    () => (profileImage ? URL.createObjectURL(profileImage) : null),
    [profileImage]
  )
  const businessPreviews = useMemo(
    () => businessImages.map((file) => ({ key: `${file.name}-${file.lastModified}`, url: URL.createObjectURL(file) })),
    [businessImages]
  )

  useEffect(() => () => { if (profilePreview) URL.revokeObjectURL(profilePreview) }, [profilePreview])
  useEffect(
    () => () => businessPreviews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [businessPreviews]
  )

  function pickProfile(file: File | null) {
    setFileError(null)
    if (!file) return onProfileChange(null)
    const problem = checkImageFile(file)
    if (problem) return setFileError(problem)
    onProfileChange(file)
  }

  function addBusiness(selected: FileList | null) {
    setFileError(null)
    if (!selected?.length) return

    const accepted: File[] = []
    for (const file of Array.from(selected)) {
      const problem = checkImageFile(file)
      if (problem) {
        setFileError(problem)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return

    const merged = [...businessImages, ...accepted]
    if (merged.length > MAX_BUSINESS_IMAGES) {
      setFileError(`You can upload up to ${MAX_BUSINESS_IMAGES} shop photos.`)
    }
    onBusinessChange(merged.slice(0, MAX_BUSINESS_IMAGES))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-suzuki-line bg-suzuki-ice flex items-center justify-center">
          {profilePreview ? (
            <img src={profilePreview} alt="Profile preview" className="h-full w-full object-cover" />
          ) : (
            <Camera className="text-suzuki-mute" size={26} />
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-suzuki-mute">Profile photo (optional)</p>
          <p className="text-[11px] text-suzuki-mute">Owner photo shown on your profile.</p>
          <input
            ref={profileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickProfile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-3 pt-0.5">
            <button
              type="button"
              onClick={() => profileRef.current?.click()}
              className="rounded-lg border border-suzuki-navy/20 bg-white px-3 py-2 text-xs font-bold text-suzuki-navy hover:bg-suzuki-ice"
            >
              {profileImage ? 'Change photo' : 'Take / upload photo'}
            </button>
            {profileImage && (
              <button
                type="button"
                onClick={() => pickProfile(null)}
                className="text-xs font-semibold text-suzuki-mute hover:text-suzuki-red"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-suzuki-mute">
          Shop / business photos {businessRequired ? '*' : '(optional)'}
        </p>
        <p className="mb-2 mt-0.5 text-[11px] text-suzuki-mute">{businessHint}</p>
        <div className="flex flex-wrap gap-3">
          {businessPreviews.map((preview, index) => (
            <div
              key={preview.key}
              className="relative h-20 w-20 overflow-hidden rounded-xl border border-suzuki-line bg-white"
            >
              <img src={preview.url} alt={`Shop photo ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onBusinessChange(businessImages.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                aria-label={`Remove shop photo ${index + 1}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {businessImages.length < MAX_BUSINESS_IMAGES && (
            <>
              <input
                ref={businessRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addBusiness(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => businessRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-suzuki-red/50 text-[10px] font-bold text-suzuki-red hover:bg-rose-50"
              >
                <ImagePlus size={18} />
                Add
              </button>
            </>
          )}
        </div>
      </div>

      {fileError && <p className="text-xs font-semibold text-suzuki-red">{fileError}</p>}
    </div>
  )
}
