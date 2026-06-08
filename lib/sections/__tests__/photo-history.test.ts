import { describe, it, expect } from "vitest";
import { groupPhotosByMonth } from '../photo-history'

describe('groupPhotosByMonth', () => {
  const photos = [
    { id: '1', url: 'https://example.com/a.jpg', createdAt: new Date('2026-04-05'), analysis: 'Healthy' },
    { id: '2', url: 'https://example.com/b.jpg', createdAt: new Date('2026-04-22'), analysis: null },
    { id: '3', url: 'https://example.com/c.jpg', createdAt: new Date('2026-05-10'), analysis: 'Some weeds' },
    { id: '4', url: 'https://example.com/d.jpg', createdAt: new Date('2026-06-01'), analysis: 'Improving' },
  ]

  it('groups photos into months sorted newest first', () => {
    const groups = groupPhotosByMonth(photos)
    expect(groups[0].label).toBe('June 2026')
    expect(groups[1].label).toBe('May 2026')
    expect(groups[2].label).toBe('April 2026')
  })

  it('puts all photos for the same month in the same group', () => {
    const groups = groupPhotosByMonth(photos)
    const april = groups.find(g => g.label === 'April 2026')
    expect(april?.photos).toHaveLength(2)
  })

  it('returns empty array for no photos', () => {
    expect(groupPhotosByMonth([])).toEqual([])
  })
})
