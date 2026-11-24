import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3, BookOpen, Bell, Boxes, CalendarClock, ChevronsLeft, ChevronsRight, FileText, Globe, LayoutDashboard, Lock, Menu, PartyPopper, Receipt, ReceiptText,
  Search, Settings as SettingsIcon, ShieldCheck, ShoppingCart, Store, TrendingUp, Truck, UserCheck, Users, Wallet, ClipboardList, LogOut,
} from 'lucide-react'
import { useStore, actions, currentUser } from './lib/store'
import { NAV, canAccess, go, useRoute } from './lib/perm'
import { batchStatus, lowStockProducts, supplierBalances } from './lib/calc'
import { cn, fmtDate, fmtTime, inr, nowTimeStr, todayStr, TZ } from './lib/util'
import { Badge, DialogHost, Dropdown, EmptyState, Notice, PageHeader, toast } from './components/ui'
import Dashboard from './pages/Dashboard'
import Guide from './pages/Guide'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Customers from './pages/Customers'
import Orders from './pages/Orders'
import Inventory from './pages/Inventory'
import Expiry from './pages/Expiry'
import Suppliers from './pages/Suppliers'
import Payments from './pages/Payments'
import Expenses from './pages/Expenses'
import PnL from './pages/PnL'
import GST from './pages/GST'
import Operations from './pages/Operations'
import Staff from './pages/Staff'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

const ICONS: Record<string, any> = {
  dashboard: LayoutDashboard, guide: BookOpen, pos: ShoppingCart, sales: Receipt, customers: Users, orders: ClipboardList, online: Globe, festival: PartyPopper,
  inventory: Boxes, expiry: CalendarClock, suppliers: Truck, payments: Wallet, expenses: ReceiptText, pnl: TrendingUp, gst: FileText, operations: Store, staff: UserCheck,
  reports: BarChart3, settings: SettingsIcon,
}

function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0"><rect width="32" height="32" rx="8" fill="#f59e0b" /><path d="M16 5.5l8.5 5v11L16 26.5l-8.5-5v-11z" fill="#7a2538" /><circle cx="16" cy="16" r="3.6" fill="#fbbf24" /></svg>
      {!small && (
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold text-white">Shree Mishtanna</div>
          <div className="text-[10.5px] tracking-[0.14em] uppercase text-saffron-400">Bhandar · ERP</div>
        </div>
      )}
    </div>
  )
}

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 15000); return () => clearInterval(i) }, [])
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(t)
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(t)
  return (
    <div className="hidden md:block text-right leading-tight">
      <div className="text-[13px] font-semibold text-stone-900 num">{time.toUpperCase()}</div>
      <div className="text-[11px] text-stone-500">{date} · IST</div>
    </div>
  )
}

function GlobalSearch() {
  const s = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const r: { type: string; label: string; sub: string; page: string; q: string }[] = []
    s.products.filter((p) => !p.archived && (p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t))).slice(0, 4).forEach((p) => r.push({ type: 'Product', label: p.name, sub: `${p.sku} · ${p.category}`, page: 'inventory', q: p.name }))
    s.customers.filter((c) => c.name.toLowerCase().includes(t) || c.mobile.includes(t)).slice(0, 3).forEach((c) => r.push({ type: 'Customer', label: c.name, sub: c.mobile, page: 'customers', q: c.name }))
    s.sales.filter((x) => x.invoiceNo.toLowerCase().includes(t) || x.customerName.toLowerCase().includes(t)).slice(-3).reverse().forEach((x) => r.push({ type: 'Invoice', label: x.invoiceNo, sub: `${x.customerName} · ${inr(x.total)}`, page: 'sales', q: x.invoiceNo }))
    s.orders.filter((o) => o.orderNo.toLowerCase().includes(t) || o.customerName.toLowerCase().includes(t)).slice(0, 3).forEach((o) => r.push({ type: 'Order', label: o.orderNo, sub: `${o.customerName} · ${o.status}`, page: o.festivalId ? 'festival' : o.source === 'Walk-in' ? 'orders' : 'online', q: o.orderNo }))
    s.suppliers.filter((x) => x.name.toLowerCase().includes(t)).slice(0, 2).forEach((x) => r.push({ type: 'Supplier', label: x.name, sub: x.supplies, page: 'suppliers', q: x.name }))
    return r
  }, [q, s])
  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
      <input className="input !h-9 !pl-9 !bg-stone-50" placeholder="Search products, customers, invoices, orders…" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-40 top-full mt-1.5 w-full card shadow-xl overflow-hidden">
          {results.length === 0 && <div className="px-3 py-4 text-sm text-stone-500">No matches for “{q}”.</div>}
          {results.map((r, i) => (
            <button key={i} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-stone-50 cursor-pointer"
              onClick={() => { go(r.page, { q: r.q }); setOpen(false); setQ('') }}>
              <div className="min-w-0"><div className="text-[13px] font-medium text-stone-900 truncate">{r.label}</div><div className="text-[11px] text-stone-500 truncate">{r.sub}</div></div>
              <Badge tone="gray">{r.type}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const s = useStore()
  const items = useMemo(() => {
    const today = todayStr()
    const out: { tone: 'red' | 'amber' | 'blue'; text: string; page: string }[] = []
    const low = lowStockProducts(s)
    if (low.length) out.push({ tone: 'amber', text: `${low.length} product${low.length > 1 ? 's' : ''} at or below minimum stock`, page: 'inventory' })
    const exp = s.batches.filter((b) => b.locationId === 'main' && b.qty > 0 && b.expiry < today)
    if (exp.length) out.push({ tone: 'red', text: `${exp.length} expired batch${exp.length > 1 ? 'es' : ''} still in stock — record wastage`, page: 'expiry' })
    const et = s.batches.filter((b) => b.qty > 0 && b.expiry === today)
    if (et.length) out.push({ tone: 'amber', text: `${et.length} batch${et.length > 1 ? 'es' : ''} expire today`, page: 'expiry' })
    const pend = s.orders.filter((o) => o.acceptance === 'Pending' && o.status !== 'Cancelled')
    if (pend.length) out.push({ tone: 'blue', text: `${pend.length} online order${pend.length > 1 ? 's' : ''} awaiting accept / reject`, page: 'online' })
    const dueToday = s.orders.filter((o) => o.dueDate === today && !['Delivered', 'Cancelled'].includes(o.status))
    if (dueToday.length) out.push({ tone: 'blue', text: `${dueToday.length} order${dueToday.length > 1 ? 's' : ''} due for delivery / pickup today`, page: 'orders' })
    const sb = supplierBalances(s)
    const overdue = s.purchaseInvoices.filter((i) => (sb.invDue.get(i.id) || 0) > 0 && i.dueDate < today)
    if (overdue.length) out.push({ tone: 'red', text: `${overdue.length} supplier invoice${overdue.length > 1 ? 's are' : ' is'} overdue`, page: 'suppliers' })
    if (!s.days.find((d) => d.date === today)?.openedAt) out.push({ tone: 'amber', text: 'Shop has not been opened for today', page: 'operations' })
    return out
  }, [s])
  return (
    <Dropdown width="w-80" trigger={
      <button className="btn-ghost btn-icon !size-9 relative" aria-label="Notifications"><Bell className="size-4.5" />{items.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-brand-700 text-white text-[10px] grid place-items-center">{items.length}</span>}</button>
    }>
      {(close) => (
        <div>
          <div className="px-3 py-2.5 border-b border-stone-200 text-[13px] font-semibold">Notifications</div>
          {items.length === 0 && <div className="p-4 text-sm text-stone-500">All clear — nothing needs attention.</div>}
          {items.map((n, i) => (
            <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 flex gap-2.5 border-b border-stone-100 last:border-0 cursor-pointer" onClick={() => { close(); go(n.page) }}>
              <span className={cn('mt-1.5 size-2 rounded-full shrink-0', n.tone === 'red' ? 'bg-red-500' : n.tone === 'amber' ? 'bg-amber-500' : 'bg-sky-500')} />
              <span className="text-[13px] text-stone-800">{n.text}</span>
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function UserMenu() {
  const s = useStore()
  const u = currentUser(s)
  return (
    <Dropdown width="w-72" trigger={
      <button className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-stone-100 cursor-pointer">
        <div className="size-8 rounded-full bg-brand-700 text-white grid place-items-center text-xs font-semibold">{u.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
        <div className="text-left leading-tight hidden sm:block"><div className="text-[13px] font-medium text-stone-900">{u.name}</div><div className="text-[11px] text-stone-500">{u.title}</div></div>
      </button>
    }>
      {(close) => (
        <div>
          <div className="px-3 py-2.5 border-b border-stone-200"><div className="text-[13px] font-semibold flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand-700" />Switch demo role</div><div className="text-[11px] text-stone-500 mt-0.5">Menus and actions change with each role.</div></div>
          {s.users.map((x) => (
            <button key={x.id} onClick={() => { actions.setUser(x.id); close(); toast.info(`Now using the app as ${x.title} (${x.role === 'Owner' ? 'Owner/Admin' : x.role === 'Inventory' ? 'Inventory Staff' : x.role})`); if (!canAccess(x.role, useRouteSnapshot())) go('dashboard') }}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 text-left cursor-pointer', x.id === u.id && 'bg-brand-50')}>
              <div className="size-7 rounded-full bg-stone-200 grid place-items-center text-[11px] font-semibold text-stone-700">{x.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
              <div className="flex-1 leading-tight"><div className="text-[13px] font-medium">{x.name}</div><div className="text-[11px] text-stone-500">{x.role === 'Owner' ? 'Owner / Admin' : x.role === 'Inventory' ? 'Inventory Staff' : x.role}</div></div>
              {x.id === u.id && <Badge tone="brand">Active</Badge>}
            </button>
          ))}
          <div className="px-3 py-2 border-t border-stone-200 text-[11px] text-stone-500 flex items-center gap-1.5"><LogOut className="size-3" />Demo mode — no password required</div>
        </div>
      )}
    </Dropdown>
  )
}
const useRouteSnapshot = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard')

function ShopStatus() {
  const s = useStore()
  const rec = s.days.find((d) => d.date === todayStr())
  const [label, tone] = rec?.closedAt ? [`Closed ${fmtTime(rec.closedAt)}`, 'gray' as const] : rec?.openedAt ? [`Open since ${fmtTime(rec.openedAt)}`, 'green' as const] : ['Not opened yet', 'amber' as const]
  return <button className="hidden lg:block cursor-pointer" onClick={() => go('operations')}><Badge tone={tone}><span className={cn('size-1.5 rounded-full', tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-stone-400')} />{label}</Badge></button>
}

function AccessDenied({ page }: { page: string }) {
  const s = useStore()
  const u = currentUser(s)
  const nav = NAV.find((n) => n.id === page)
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="mx-auto size-14 rounded-full bg-stone-100 grid place-items-center mb-4"><Lock className="size-6 text-stone-500" /></div>
      <h2 className="text-lg font-semibold">Access restricted</h2>
      <p className="text-sm text-stone-600 mt-1.5"><b>{nav?.label}</b> isn’t available to the <b>{u.role === 'Owner' ? 'Owner/Admin' : u.role === 'Inventory' ? 'Inventory Staff' : u.role}</b> role.</p>
      <p className="text-xs text-stone-500 mt-1">Available to: {nav?.roles.map((r) => (r === 'Inventory' ? 'Inventory Staff' : r === 'Owner' ? 'Owner/Admin' : r)).join(', ')}. Use the profile menu (top right) to switch the demo role.</p>
      <button className="btn-primary mt-4" onClick={() => go('dashboard')}>Back to dashboard</button>
    </div>
  )
}

export default function App() {
  const s = useStore()
  const user = currentUser(s)
  const { path, query } = useRoute()
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => { setMobileOpen(false); document.getElementById('main-scroll')?.scrollTo(0, 0) }, [path])
  useEffect(() => {
    const h = () => setCollapsed(window.innerWidth < 1100)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const page = NAV.some((n) => n.id === path) ? path : 'dashboard'
  const allowed = canAccess(user.role, page)
  const groups = NAV.reduce<Record<string, typeof NAV>>((a, n) => ((a[n.group] ||= []).push(n), a), {})

  const body: ReactNode = !allowed ? <AccessDenied page={page} /> : (() => {
    const q = query.q || ''
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'guide': return <Guide />
      case 'pos': return <POS />
      case 'sales': return <Sales q={q} />
      case 'customers': return <Customers q={q} />
      case 'orders': return <Orders mode="orders" q={q} />
      case 'online': return <Orders mode="online" q={q} />
      case 'festival': return <Orders mode="festival" q={q} />
      case 'inventory': return <Inventory q={q} />
      case 'expiry': return <Expiry q={q} />
      case 'suppliers': return <Suppliers q={q} />
      case 'payments': return <Payments />
      case 'expenses': return <Expenses />
      case 'pnl': return <PnL />
      case 'gst': return <GST />
      case 'operations': return <Operations />
      case 'staff': return <Staff />
      case 'reports': return <Reports />
      case 'settings': return <Settings />
    }
  })()

  const sidebar = (
    <aside className={cn('bg-side text-stone-300 flex flex-col h-full shrink-0 transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-[248px]')}>
      <div className={cn('h-14 flex items-center border-b border-white/10', collapsed ? 'justify-center' : 'px-4')}><Logo small={collapsed} /></div>
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
        {Object.entries(groups).map(([g, items]) => (
          <div key={g}>
            {!collapsed && <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{g}</div>}
            <div className="space-y-0.5">
              {items.map((n) => {
                const Icon = ICONS[n.id]
                const ok = n.roles.includes(user.role)
                const active = page === n.id
                return (
                  <button key={n.id} title={collapsed ? n.label : undefined} onClick={() => go(n.id)}
                    className={cn('w-full flex items-center gap-3 rounded-lg px-2.5 h-9 text-[13px] cursor-pointer transition-colors', collapsed && 'justify-center', active ? 'bg-brand-700 text-white' : ok ? 'hover:bg-white/8 text-stone-300' : 'text-stone-600 hover:bg-white/5')}>
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 text-left truncate">{n.label}</span>}
                    {!collapsed && !ok && <Lock className="size-3 opacity-70" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-2.5 border-t border-white/10 hidden lg:block">
        <button className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-xs text-stone-400 hover:bg-white/8 cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="h-full flex">
      <div className="hidden md:block h-full">{sidebar}</div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setMobileOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>{(() => { const c = collapsed; return <div className={c ? '' : ''}>{sidebar}</div> })()}</div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <header className="h-14 bg-white border-b border-stone-200 flex items-center gap-3 px-4 shrink-0">
          <button className="btn-ghost btn-icon md:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="flex-1" />
          <ShopStatus />
          <Clock />
          <div className="h-6 w-px bg-stone-200 hidden md:block" />
          <Notifications />
          <UserMenu />
        </header>
        <main id="main-scroll" className="flex-1 overflow-y-auto">
          <div className="max-w-[1480px] mx-auto p-4 md:p-6">{body}</div>
        </main>
      </div>
      <DialogHost />
    </div>
  )
}

