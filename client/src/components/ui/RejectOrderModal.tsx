/** Optional note prompt before reject / cancel order. */
export function RejectOrderModal({
  title,
  description,
  confirmLabel = 'Reject order',
  note,
  busy,
  onNoteChange,
  onBack,
  onConfirm
}: {
  title: string
  description: string
  confirmLabel?: string
  note: string
  busy?: boolean
  onNoteChange: (value: string) => void
  onBack: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onBack}>
      <div
        className="bg-white rounded-2xl shadow-card max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-extrabold text-suzuki-navy">{title}</h3>
        <p className="text-sm text-suzuki-mute">{description}</p>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">
            Note <span className="font-semibold normal-case text-suzuki-mute">(optional)</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={4}
            placeholder="Add a note for the other party…"
            className="mt-1.5 w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-suzuki-blue/30 focus:border-suzuki-blue resize-none"
          />
        </label>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="rounded-xl bg-suzuki-ice text-suzuki-navy font-bold px-5 py-2.5 text-sm hover:bg-suzuki-line/40 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-suzuki-red text-white font-bold px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
