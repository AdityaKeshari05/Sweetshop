export const TZ = 'Asia/Kolkata'

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

export function inr(n: number, dec = 0): string {
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return (neg ? '-' : '') + '₹' + s
}
export const inr2 = (n: number) => inr(n, 2)
export const num = (n: number, d = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: d })

export function fmtQty(q: number, unit: string): string {
  if (unit === 'kg') {
    if (q < 1 && q > 0) return Math.round(q * 1000) + ' g'
    return num(r3(q), 3) + ' kg'
  }
  return num(r3(q), 0) + (unit === 'box' ? (q === 1 ? ' box' : ' boxes') : ' pc')
}

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
export const nowTimeStr = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
export const nowISO = () => todayStr() + 'T' + nowTimeStr()

const p = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, dd)
}
export const addDays = (d: string, n: number) => new Date(p(d) + n * 86400000).toISOString().slice(0, 10)
export const dayDiff = (a: string, b: string) => Math.round((p(b) - p(a)) / 86400000)
export const dow = (d: string) => new Date(p(d)).getUTCDay() // 0 Sun
export const monthStart = (d: string) => d.slice(0, 8) + '01'
export const daysInMonth = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate()
export const monthEnd = (d: string) => d.slice(0, 8) + String(daysInMonth(d)).padStart(2, '0')
export const weekStart = (d: string) => addDays(d, -((dow(d) + 6) % 7))
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 800; d = addDays(d, 1)) out.push(d)
  return out
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (d?: string) => (d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—')
export const fmtDay = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`
export const fmtMonth = (d: string) => `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
export const weekday = (d: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow(d)]
export function fmtTime(t?: string): string {
  if (!t) return '—'
  const hhmm = t.length > 5 ? t.slice(11, 16) : t
  let [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}
export const fmtDT = (at: string) => `${fmtDate(at.slice(0, 10))}, ${fmtTime(at)}`
export const timeToMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)

export function fyLabel(d: string) {
  const y = +d.slice(0, 4)
  const m = +d.slice(5, 7)
  const s = m >= 4 ? y : y - 1
  return `${String(s).slice(2)}-${String(s + 1).slice(2)}`
}

let seq = 0
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function two(n: number): string {
  return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
}
export function amountInWords(amount: number): string {
  let n = Math.round(Math.abs(amount))
  if (n === 0) return 'Zero Rupees Only'
  const parts: string[] = []
  const cr = Math.floor(n / 10000000); n %= 10000000
  const lk = Math.floor(n / 100000); n %= 100000
  const th = Math.floor(n / 1000); n %= 1000
  const hu = Math.floor(n / 100); n %= 100
  if (cr) parts.push(two(cr) + ' Crore')
  if (lk) parts.push(two(lk) + ' Lakh')
  if (th) parts.push(two(th) + ' Thousand')
  if (hu) parts.push(ones[hu] + ' Hundred')
  if (n) parts.push(two(n))
  return parts.join(' ') + ' Rupees Only'
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
export const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0)
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
