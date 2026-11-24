import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Info, Lock, Search, X, XCircle } from 'lucide-react'
import { addDays, cn, downloadCSV, monthStart, todayStr, weekStart } from '../lib/util'

/* ---------------- toast & confirm (tiny global stores) ---------------- */
interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; msg: string }
let toasts: ToastItem[] = []
let tid = 0
const tl = new Set<() => void>()
const emitT = () => tl.forEach((l) => l())
function pushToast(kind: ToastItem['kind'], msg: string) {
  const id = ++tid
  toasts = [...toasts, { id, kind, msg }]
  emitT()
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emitT() }, kind === 'error' ? 6000 : 3500)
}
export const toast = { success: (m: string) => pushToast('success', m), error: (m: string) => pushToast('error', m), info: (m: string) => pushToast('info', m) }

/** Run a store action; show success toast or the validation error. Returns undefined on failure. */
export function run<T>(fn: () => T, success?: string): { ok: true; value: T } | { ok: false } {
  try {
    const value = fn()
    if (success) toast.success(success)
    return { ok: true, value }
  } catch (e: any) {
    toast.error(e?.message || 'Something went wrong')
    return { ok: false }
  }
}

interface ConfirmState { title: string; message: ReactNode; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
let confirmState: ConfirmState | null = null
const cl = new Set<() => void>()
export function confirmDialog(o: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { title: o.title, message: o.message, confirmLabel: o.confirmLabel || 'Confirm', danger: !!o.danger, resolve }
    cl.forEach((l) => l())
  })
}

export function DialogHost() {
  const ts = useSyncExternalStore((l) => (tl.add(l), () => tl.delete(l)), () => toasts)
  const cs = useSyncExternalStore((l) => (cl.add(l), () => cl.delete(l)), () => confirmState)
  const close = (v: boolean) => { cs?.resolve(v); confirmState = null; cl.forEach((l) => l()) }
  return (
    <>
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[92vw]">
        {ts.map((t) => (
          <div key={t.id} className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg bg-white text-[13px]', t.kind === 'error' ? 'border-red-200' : t.kind === 'success' ? 'border-emerald-200' : 'border-stone-200')}>
            {t.kind === 'error' ? <XCircle className="size-4 text-red-600 mt-0.5 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" /> : <Info className="size-4 text-sky-600 mt-0.5 shrink-0" />}
            <span className="text-stone-800">{t.msg}</span>
          </div>
        ))}
      </div>
      {cs && (
        <Modal open onClose={() => close(false)} title={cs.title} size="sm"
          footer={<><button className="btn-secondary" onClick={() => close(false)}>Cancel</button><button className={cs.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} autoFocus>{cs.confirmLabel}</button></>}>
          <div className="flex gap-3">
            {cs.danger && <div className="size-9 rounded-full bg-red-50 grid place-items-center shrink-0"><AlertTriangle className="size-4.5 text-red-600" /></div>}
            <div className="text-sm text-stone-700 leading-relaxed">{cs.message}</div>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ---------------- primitives ---------------- */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', '2xl': 'max-w-6xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/45 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('w-full bg-white rounded-2xl shadow-2xl border border-stone-200 my-auto', w)}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>
            {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          <button className="btn-ghost btn-icon -mr-1" onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-stone-200 bg-stone-50/70 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Card({ title, subtitle, actions, children, className, pad = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div>
            <h3 className="text-[13px] font-semibold text-stone-900">{title}</h3>
            {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(pad ? 'px-4 pb-4' : '', !title && !actions && pad && 'pt-4')}>{children}</div>
    </section>
  )
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  gray: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
}
export type Tone = keyof typeof tones
export const Badge = ({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => <span className={cn('badge', tones[tone], className)}>{children}</span>

export const statusTone = (s: string): Tone =>
  ({
    'In stock': 'green', 'Low stock': 'amber', 'Out of stock': 'red', 'Expiring soon': 'amber', Expired: 'red', 'Expires today': 'red', 'Within 7 days': 'blue', Fresh: 'green', Empty: 'gray',
    Received: 'gray', Confirmed: 'blue', Preparing: 'amber', Ready: 'purple', Dispatched: 'blue', Delivered: 'green', Cancelled: 'red', Completed: 'green', Present: 'green', Absent: 'red',
    'Half-day': 'amber', Leave: 'blue', Paid: 'green', Partial: 'amber', Unpaid: 'red', Ordered: 'blue', Success: 'green', Pending: 'amber', Failed: 'red', Accepted: 'green', Rejected: 'red',
    Open: 'green', Closed: 'gray', Overdue: 'red', Refunded: 'purple',
  } as Record<string, Tone>)[s] || 'gray'
export const StatusBadge = ({ s }: { s: string }) => <Badge tone={statusTone(s)}>{s}</Badge>

export function Field({ label, children, hint, className, required }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-500 mt-1">{hint}</span>}
    </label>
  )
}

export function NumInput({ value, onChange, step, min, className, placeholder, disabled }: { value: number | ''; onChange: (v: number) => void; step?: number | string; min?: number; className?: string; placeholder?: string; disabled?: boolean }) {
  return <input type="number" inputMode="decimal" className={cn('input num', className)} value={value} step={step} min={min} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? ('' as any) : Number(e.target.value))} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="text-[13px] text-stone-500 mt-0.5 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, icon, tone = 'brand', locked, onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'gray'; locked?: boolean; onClick?: () => void }) {
  const t = { brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', blue: 'bg-sky-50 text-sky-700', gray: 'bg-stone-100 text-stone-600' }[tone]
  return (
    <div className={cn('card p-3.5 flex items-start gap-3', onClick && 'cursor-pointer hover:border-stone-300')} onClick={onClick}>
      {icon && <div className={cn('size-9 rounded-lg grid place-items-center shrink-0', t)}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
        {locked ? (
          <div className="flex items-center gap-1.5 text-stone-400 mt-1"><Lock className="size-3.5" /><span className="text-sm">Restricted</span></div>
        ) : (
          <div className="text-xl font-semibold text-stone-900 num leading-tight mt-0.5">{value}</div>
        )}
        {sub && !locked && <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto size-10 rounded-full bg-stone-100 grid place-items-center mb-2.5"><Search className="size-4.5 text-stone-400" /></div>
      <div className="text-sm font-medium text-stone-700">{title}</div>
      {hint && <div className="text-xs text-stone-500 mt-1">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, counts }: { tabs: { id: string; label: string }[]; value: string; onChange: (v: any) => void; counts?: Record<string, number | undefined> }) {
  return (
    <div className="flex gap-1 border-b border-stone-200 mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cn('px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap cursor-pointer', value === t.id ? 'border-brand-700 text-brand-700' : 'border-transparent text-stone-500 hover:text-stone-800')}>
          {t.label}
          {counts?.[t.id] !== undefined && <span className={cn('ml-1.5 rounded-full px-1.5 text-[10px]', value === t.id ? 'bg-brand-100 text-brand-700' : 'bg-stone-100 text-stone-500')}>{counts[t.id]}</span>}
        </button>
      ))}
    </div>
  )
}

export function Segmented({ options, value, onChange, size = 'md' }: { options: { id: string; label: string }[]; value: string; onChange: (v: any) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={cn('rounded-md font-medium cursor-pointer transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]', value === o.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-800')}>{o.label}</button>
      ))}
    </div>
  )
}

export function PrintArea({ children }: { children: ReactNode }) {
  const el = document.getElementById('print-root')
  return el ? createPortal(children, el) : null
}

export function Notice({ tone = 'amber', children, icon }: { tone?: 'amber' | 'blue' | 'red' | 'green'; children: ReactNode; icon?: ReactNode }) {
  const t = { amber: 'bg-amber-50 border-amber-200 text-amber-900', blue: 'bg-sky-50 border-sky-200 text-sky-900', red: 'bg-red-50 border-red-200 text-red-900', green: 'bg-emerald-50 border-emerald-200 text-emerald-900' }[tone]
  return <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed', t)}>{icon ?? <Info className="size-3.5 mt-0.5 shrink-0" />}<div>{children}</div></div>
}

/* ---------------- date range ---------------- */
export type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
export interface DateRange { key: RangeKey; from: string; to: string }
export function rangeFor(key: RangeKey, custom?: { from: string; to: string }): DateRange {
  const t = todayStr()
  if (key === 'today') return { key, from: t, to: t }
  if (key === 'yesterday') return { key, from: addDays(t, -1), to: addDays(t, -1) }
  if (key === 'week') return { key, from: weekStart(t), to: t }
  if (key === 'month') return { key, from: monthStart(t), to: t }
  return { key, from: custom?.from || addDays(t, -6), to: custom?.to || t }
}
export function RangePicker({ value, onChange, compact }: { value: DateRange; onChange: (r: DateRange) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented size={compact ? 'sm' : 'md'} value={value.key} onChange={(k) => onChange(rangeFor(k, value))}
        options={[{ id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'week', label: 'This Week' }, { id: 'month', label: 'This Month' }, { id: 'custom', label: 'Custom' }]} />
      {value.key === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="input !w-36" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-stone-400">–</span>
          <input type="date" className="input !w-36" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  )
}

/* ---------------- data table ---------------- */
export interface Col<T> {
  key: string
  header: string
  render?: (r: T) => ReactNode
  value?: (r: T) => string | number | null | undefined
  align?: 'right' | 'center'
  className?: string
  noSort?: boolean
  noCsv?: boolean
}
export function DataTable<T>({ columns, rows, rowKey, searchable = true, defaultSearch = '', pageSize = 12, exportName, onRowClick, empty, toolbar, footer, dense, searchPlaceholder, initialSort }: {
  columns: Col<T>[]; rows: T[]; rowKey: (r: T) => string; searchable?: boolean; defaultSearch?: string; pageSize?: number; exportName?: string; onRowClick?: (r: T) => void
  empty?: ReactNode; toolbar?: ReactNode; footer?: ReactNode; dense?: boolean; searchPlaceholder?: string; initialSort?: { key: string; dir: 1 | -1 }
}) {
  const [q, setQ] = useState(defaultSearch)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort || null)
  const [page, setPage] = useState(0)
  useEffect(() => setQ(defaultSearch), [defaultSearch])
  const val = (c: Col<T>, r: T) => (c.value ? c.value(r) : (r as any)[c.key])
  const filtered = useMemo(() => {
    let out = rows
    const s = q.trim().toLowerCase()
    if (s) out = out.filter((r) => columns.some((c) => String(val(c, r) ?? '').toLowerCase().includes(s)))
    if (sort) {
      const c = columns.find((x) => x.key === sort.key)
      if (c) out = [...out].sort((a, b) => {
        const x = val(c, a), y = val(c, b)
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
        return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * sort.dir
      })
    }
    return out
  }, [rows, q, sort, columns])
  useEffect(() => setPage(0), [q, rows.length])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const exportCsv = () => downloadCSV(exportName || 'export', columns.filter((c) => !c.noCsv).map((c) => c.header), filtered.map((r) => columns.filter((c) => !c.noCsv).map((c) => val(c, r) as any)))
  return (
    <div>
      {(searchable || toolbar || exportName) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {searchable && (
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="input !w-60 !pl-8" placeholder={searchPlaceholder || 'Search…'} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-stone-500">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
            {exportName && <button className="btn-secondary btn-sm" onClick={exportCsv} disabled={!filtered.length}><Download className="size-3.5" />CSV</button>}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('th', c.align === 'right' && '!text-right', c.align === 'center' && '!text-center', !c.noSort && 'cursor-pointer select-none hover:text-stone-800')}
                  onClick={() => !c.noSort && setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                  <span className="inline-flex items-center gap-1">{c.header}{!c.noSort && (sort?.key === c.key ? <span className="text-brand-700">{sort.dir === 1 ? '↑' : '↓'}</span> : <ChevronsUpDown className="size-3 opacity-40" />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cur.map((r) => (
              <tr key={rowKey(r)} className={cn('hover:bg-stone-50/80', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('td', dense && '!py-1.5', c.align === 'right' && 'text-right num', c.align === 'center' && 'text-center', c.className)}>
                    {c.render ? c.render(r) : (val(c, r) as any) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!cur.length && (
              <tr><td colSpan={columns.length}>{empty ?? <EmptyState title="No records found" hint={q ? 'Try a different search term.' : undefined} />}</td></tr>
            )}
          </tbody>
          {footer}
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <button className="btn-secondary btn-sm btn-icon" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-3.5" /></button>
            <button className="btn-secondary btn-sm btn-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- misc hooks ---------------- */
export function useOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && cb()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, cb])
}
export function Dropdown({ trigger, children, align = 'right', width = 'w-72' }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && <div className={cn('absolute top-full mt-2 z-40 card shadow-xl overflow-hidden', width, align === 'right' ? 'right-0' : 'left-0')}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

/** Simple horizontal bar list used for top-product style rankings */
export function BarList({ items, format }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <EmptyState title="No data in this period" />
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-[13px]"><span className="text-stone-800 truncate pr-2">{i.label}</span><span className="num font-medium text-stone-900">{format(i.value)}</span></div>
          <div className="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(i.value / max) * 100}%` }} /></div>
          {i.sub && <div className="text-[11px] text-stone-500 mt-0.5">{i.sub}</div>}
        </li>
      ))}
    </ul>
  )
}
