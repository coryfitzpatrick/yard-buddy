'use client'

import { groupPhotosByMonth } from '@/lib/sections/photo-history'

type Photo = {
  id: string
  url: string
  createdAt: Date
  analysis?: string | null
}

type Props = {
  photos: Photo[]
  sectionName: string
}

export function PhotoTimeline({ photos, sectionName }: Props) {
  const groups = groupPhotosByMonth(photos)

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg font-medium">No photos yet</p>
        <p className="text-sm mt-1">Add photos to {sectionName} to track lawn health over time.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.yearMonth}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {group.label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.photos.map((photo) => (
              <div key={photo.id} className="group relative rounded-lg overflow-hidden aspect-square bg-gray-100">
                <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                  <img
                    src={photo.url}
                    alt={`${sectionName} — ${new Date(photo.createdAt).toLocaleDateString()}`}
                    className="w-full h-full object-cover"
                  />
                </a>
                {photo.analysis && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                    {photo.analysis.slice(0, 80)}{photo.analysis.length > 80 ? '…' : ''}
                  </div>
                )}
                <div className="absolute top-2 left-2 text-xs text-white bg-black/50 rounded px-1.5 py-0.5 pointer-events-none">
                  {new Date(photo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
