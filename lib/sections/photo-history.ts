type Photo = {
  id: string
  url: string
  createdAt: Date
  analysis?: string | null
}

type PhotoGroup = {
  label: string     // "June 2026"
  yearMonth: string // "2026-06" for sorting
  photos: Photo[]
}

export function groupPhotosByMonth(photos: Photo[]): PhotoGroup[] {
  const map = new Map<string, PhotoGroup>()

  for (const photo of photos) {
    const d = new Date(photo.createdAt)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })

    if (!map.has(yearMonth)) {
      map.set(yearMonth, { label, yearMonth, photos: [] })
    }
    map.get(yearMonth)!.photos.push(photo)
  }

  return Array.from(map.values()).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
}
