import { excelSerialToISO, parseISO, toISO } from './dates'

const BAD = /^(0[/.-]0[/.-]0|1[/.-]0[/.-]00|1900[/.-]1[/.-]0|1899-12-30|1899-12-31|1900-01-00)$/

export function parseExcelDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getFullYear() < 1980) return ''
    return toISO(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 200) return ''
    const iso = excelSerialToISO(value)
    return iso.startsWith('19') && Number(iso.slice(0, 4)) < 1980 ? '' : iso
  }
  const text = String(value).trim()
  if (!text || BAD.test(text.replace(/\s/g, ''))) return ''
  if (parseISO(text)) return text
  const ymd = /^(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})日?$/.exec(text)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2])
    const day = Number(ymd[3])
    if (year < 1980 || month < 1 || month > 12 || day < 1 || day > 31) return ''
    const d = new Date(year, month - 1, day, 12)
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return ''
    return toISO(d)
  }
  const mdy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text)
  if (mdy) {
    let year = Number(mdy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    const month = Number(mdy[1])
    const day = Number(mdy[2])
    if (month > 12 && day <= 12) {
      const d = new Date(year, day - 1, month, 12)
      return d.getFullYear() === year && year >= 1980 ? toISO(d) : ''
    }
    const d = new Date(year, month - 1, day, 12)
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return ''
    if (year < 1980) return ''
    return toISO(d)
  }
  return ''
}

export function cellText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\r/g, '').trim()
}

export function cellNum(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function yesValue(value: unknown): boolean {
  const t = cellText(value)
  return t === '是' || t === '√' || t === '★' || t.toLowerCase() === 'true' || t === 'Y'
}
