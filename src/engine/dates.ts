const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseISO(value: string): Date | null {
  const m = ISO.exec(value.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(now = new Date()): string {
  return toISO(now)
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function diffDays(start: string, end: string): number | null {
  const a = parseISO(start)
  const b = parseISO(end)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function durationFromRange(start: string, end: string): number {
  const days = diffDays(start, end)
  if (days === null) return 0
  return days + 1
}

export function endFromDuration(start: string, duration: number): string {
  const days = Math.max(1, Math.round(duration))
  return addDays(start, days - 1)
}

export function minISO(values: string[]): string {
  const valid = values.filter((v) => parseISO(v))
  if (valid.length === 0) return ''
  return valid.reduce((a, b) => (a < b ? a : b))
}

export function maxISO(values: string[]): string {
  const valid = values.filter((v) => parseISO(v))
  if (valid.length === 0) return ''
  return valid.reduce((a, b) => (a > b ? a : b))
}

export function excelSerialToISO(serial: number): string {
  const daySerial = Math.floor(serial + 1e-6)
  const utc = Date.UTC(1899, 11, 30) + daySerial * 86_400_000
  const d = new Date(utc)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function cellToISO(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISO(value)
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToISO(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (parseISO(trimmed)) return trimmed
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) return toISO(new Date(parsed))
  }
  return ''
}
