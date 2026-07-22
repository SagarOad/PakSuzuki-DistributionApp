import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title, note }: { title: string; note?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center max-w-xl mx-auto mt-10">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-suzuki-ice text-suzuki-navy flex items-center justify-center mb-4">
        <Construction size={22} />
      </div>
      <h1 className="text-xl font-bold text-suzuki-navy">{title}</h1>
      <p className="text-sm text-suzuki-mute mt-2">
        {note ?? 'This screen is part of the Super Admin portal and will be wired next.'}
      </p>
    </div>
  )
}
