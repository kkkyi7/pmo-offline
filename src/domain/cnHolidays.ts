export interface CnHoliday {
  date: string
  year: number
  name: string
  source: string
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    const [y, m, d] = cur.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1, 12)
    const yy = next.getFullYear()
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    const dd = String(next.getDate()).padStart(2, '0')
    cur = `${yy}-${mm}-${dd}`
  }
  return out
}

function block(start: string, end: string, name: string, source: string): CnHoliday[] {
  return eachDay(start, end).map((date) => ({
    date,
    year: Number(date.slice(0, 4)),
    name,
    source,
  }))
}

/** 国办发明电〔2025〕7号，2026年放假日（不含调休上班日）。 */
const Y2026 = [
  ...block('2026-01-01', '2026-01-03', '元旦', '国办发明电〔2025〕7号'),
  ...block('2026-02-15', '2026-02-23', '春节', '国办发明电〔2025〕7号'),
  ...block('2026-04-04', '2026-04-06', '清明节', '国办发明电〔2025〕7号'),
  ...block('2026-05-01', '2026-05-05', '劳动节', '国办发明电〔2025〕7号'),
  ...block('2026-06-19', '2026-06-21', '端午节', '国办发明电〔2025〕7号'),
  ...block('2026-09-25', '2026-09-27', '中秋节', '国办发明电〔2025〕7号'),
  ...block('2026-10-01', '2026-10-07', '国庆节', '国办发明电〔2025〕7号'),
]

/**
 * 2027 国办调休通知尚未发布。
 * 法定日按 2024 年修订《全国年节及纪念日放假办法》；
 * 连休按新华网解读的调休原则（春节除夕起 8/9 天、国庆 7 天、劳动节 5 天；
 * 元旦/清明连休 3 天；端午、中秋逢周三只放当天）。
 */
const Y2027_SOURCE = '法定+调休原则（2027国办通知未发）'
const Y2027 = [
  ...block('2027-01-01', '2027-01-03', '元旦', Y2027_SOURCE),
  ...block('2027-02-05', '2027-02-13', '春节', `${Y2027_SOURCE}；除夕周五顺连9天`),
  ...block('2027-04-03', '2027-04-05', '清明节', Y2027_SOURCE),
  ...block('2027-05-01', '2027-05-05', '劳动节', Y2027_SOURCE),
  ...block('2027-06-09', '2027-06-09', '端午节', `${Y2027_SOURCE}；逢周三只放当天`),
  ...block('2027-09-15', '2027-09-15', '中秋节', `${Y2027_SOURCE}；逢周三只放当天`),
  ...block('2027-10-01', '2027-10-07', '国庆节', Y2027_SOURCE),
]

export const CN_HOLIDAYS: CnHoliday[] = [...Y2026, ...Y2027]

export const CN_HOLIDAY_DATES: string[] = CN_HOLIDAYS.map((h) => h.date)

const HOLIDAY_BY_DATE = new Map(CN_HOLIDAYS.map((h) => [h.date, h]))

export function holidayShortName(iso: string): string {
  const name = HOLIDAY_BY_DATE.get(iso)?.name ?? ''
  return name.replace(/节$/, '')
}
