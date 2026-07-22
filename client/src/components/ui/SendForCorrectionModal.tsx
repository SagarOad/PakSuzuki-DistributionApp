import { ImageIcon } from 'lucide-react'
import clsx from 'clsx'

export interface CorrectionSubject {
  id: string
  name: string
  mobileNumber: string
  email: string
  location: string
  address: string
  images?: { id: string; storageUrl: string; fileName?: string }[]
}

export function SendForCorrectionModal({
  title = 'Send For Correction',
  subject,
  loading,
  remarks,
  submitting,
  onRemarksChange,
  onBack,
  onSend
}: {
  title?: string
  subject: CorrectionSubject | null
  loading?: boolean
  remarks: string
  submitting?: boolean
  onRemarksChange: (value: string) => void
  onBack: () => void
  onSend: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onBack}>
      <div
        className="bg-white rounded-2xl shadow-card max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold text-suzuki-navy mb-5">{title}</h3>

        {loading && <p className="text-sm text-suzuki-mute py-6 text-center">Loading details…</p>}

        {!loading && subject && (
          <>
            <dl className="space-y-2.5 text-sm">
              <InfoRow label="Name" value={subject.name} />
              <InfoRow label="Contact Number" value={subject.mobileNumber} />
              <InfoRow label="Email" value={subject.email} />
              <InfoRow label="Location" value={subject.location} />
              <InfoRow label="Address" value={subject.address} />
            </dl>

            <div className="mt-5">
              <div className="text-sm font-bold text-suzuki-ink mb-2">Images</div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => {
                  const img = subject.images?.[i]
                  return (
                    <div
                      key={img?.id ?? `ph-${i}`}
                      className="aspect-square rounded-lg border border-suzuki-line bg-suzuki-mist flex items-center justify-center overflow-hidden"
                    >
                      {img?.storageUrl ? (
                        <img src={img.storageUrl} alt={img.fileName || ''} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={20} className="text-suzuki-mute" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-bold text-suzuki-ink mb-2">Comments</label>
              <textarea
                value={remarks}
                onChange={(e) => onRemarksChange(e.target.value)}
                placeholder="Enter Text Here..."
                rows={4}
                className="w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-suzuki-blue/30 focus:border-suzuki-blue resize-none"
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl bg-suzuki-ice text-suzuki-navy font-bold py-3 hover:bg-suzuki-line/40 transition-colors"
              >
                BACK
              </button>
              <button
                type="button"
                disabled={submitting || !remarks.trim()}
                onClick={onSend}
                className="rounded-xl bg-suzuki-red text-white font-bold py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? 'SENDING…' : 'SEND CORRECTION'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 font-semibold text-suzuki-mute">{label}</dt>
      <dd className="font-semibold text-suzuki-ink break-all">{value || '—'}</dd>
    </div>
  )
}

export function RequestActionButton({
  tone,
  title,
  onClick,
  children
}: {
  tone: 'view' | 'approve' | 'reject' | 'correct'
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  const tones = {
    view: 'bg-suzuki-blue/10 text-suzuki-blue hover:bg-suzuki-blue/20',
    approve: 'bg-emerald-100 text-suzuki-ok hover:bg-emerald-200',
    reject: 'bg-red-100 text-suzuki-red hover:bg-red-200',
    correct: 'bg-orange-100 text-orange-600 hover:bg-orange-200'
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
        tones[tone]
      )}
    >
      {children}
    </button>
  )
}
