import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, CalendarX2, Coins, Hourglass, PackageX, PartyPopper, QrCode, Receipt, ShoppingBag, TrendingUp, Trash2, Wallet } from 'lucide-react'
import { useStore, currentUser } from '../lib/store'
import { batchStatus, lowStockProducts, orderDue, orderPaid, periodSummary, receivables, stockMap, supplierBalances, isLate } from '../lib/calc'
import { addDays, datesBetween, fmtDate, fmtDay, fmtQty, fmtTime, inr, sum, todayStr } from '../lib/util'
import { Badge, BarList, Card, EmptyState, PageHeader, RangePicker, rangeFor, StatusBadge, Stat, type DateRange } from '../components/ui'
import { go } from '../lib/perm'

const COLORS = { cash: '#2f7d5b', upi: '#8f2f44', card: '#d97706' }

export default function Dashboard() {
  const s = useStore()
  const user = currentUser(s)
  const [range, setRange] = useState<DateRange>(rangeFor('today'))
  const today = todayStr()
  const sum_ = periodSummary(s, range.from, range.to)
  const rec = receivables(s)
  const sm = stockMap(s)
  const low = lowStockProducts(s)
  const label = range.key === 'today' ? "Today's" : range.key === 'yesterday' ? "Yesterday's" : range.key === 'week' ? 'This week' : range.key === 'month' ? 'This month' : 'Period'
  const owner = user.role === 'Owner'

  const salesIn = useMemo(() => s.sales.filter((x) => x.status === 'Completed' && x.date >= range.from && x.date <= range.to), [s.sales, range])
  const trend = useMemo(() => {
    if (range.from === range.to) {
      const hrs = Array.from({ length: 13 }, (_, i) => 10 + i)
      return hrs.map((h) => ({ name: `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`, sales: Math.round(sum(salesIn.filter((x) => +x.at.slice(11, 13) === h), (x) => x.total)) }))
    }
    return datesBetween(range.from, range.to).map((d) => ({ name: fmtDay(d), sales: Math.round(sum(salesIn.filter((x) => x.date === d), (x) => x.total - x.refundedAmount)) }))
  }, [salesIn, range])

  const prod = useMemo(() => {
    const m = new Map<string, { name: string; cat: string; qty: number; unit: string; rev: number; gp: number }>()
    for (const x of salesIn) for (const l of x.lines) {
      const p = s.products.find((y) => y.id === l.productId)
      const e = m.get(l.productId) || { name: l.name, cat: p?.category || '', qty: 0, unit: l.unit, rev: 0, gp: 0 }
      e.qty += l.qty - l.refundedQty; e.rev += l.taxable; e.gp += l.taxable - l.cogs
      m.set(l.productId, e)
    }
    return [...m.values()]
  }, [salesIn, s.products])
  const topSweets = prod.filter((p) => !['Snacks', 'Namkeen', 'Gift Boxes'].includes(p.cat)).sort((a, b) => b.rev - a.rev).slice(0, 6)
  const best = [...prod].sort((a, b) => b.gp - a.gp).slice(0, 6)

  const payData = [{ name: 'Cash', value: Math.max(0, sum_.cash), color: COLORS.cash }, { name: 'UPI', value: Math.max(0, sum_.upi), color: COLORS.upi }, { name: 'Card', value: Math.max(0, sum_.card), color: COLORS.card }]
  const payTotal = sum(payData, (x) => x.value)

  const expiring = s.batches.filter((b) => b.qty > 0.0004 && b.locationId === 'main').map((b) => ({ b, st: batchStatus(b, today, s.products.find((p) => p.id === b.productId)?.shelfLife) })).filter((x) => ['Expired', 'Expires today', 'Expiring soon'].includes(x.st)).sort((a, b) => a.b.expiry.localeCompare(b.b.expiry))
  const expiringProducts = new Set(expiring.map((x) => x.b.productId)).size
  const sb = supplierBalances(s)
  const dueInv = s.purchaseInvoices.filter((i) => (sb.invDue.get(i.id) || 0) > 0.5).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const recentSales = [...s.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
  const recentOrders = [...s.orders].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
  const att = s.attendance.filter((a) => a.date === today)
  const attCount = (st: string) => att.filter((a) => a.status === st).length
  const festOrders = s.orders.filter((o) => o.festivalId && o.status !== 'Cancelled')
  const orderCount = s.orders.filter((o) => o.at.slice(0, 10) >= range.from && o.at.slice(0, 10) <= range.to && o.status !== 'Cancelled').length

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${s.settings.businessName} · ${fmtDate(range.from)}${range.from !== range.to ? ' – ' + fmtDate(range.to) : ''}`} actions={<RangePicker value={range} onChange={setRange} />} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <Stat label={`${label} sales`} value={inr(sum_.billed)} sub={`${inr(sum_.netSales)} net of GST`} icon={<Receipt className="size-4.5" />} />
        <Stat label="Total orders" value={sum_.bills} sub={`${orderCount} customer / online orders placed`} icon={<ShoppingBag className="size-4.5" />} tone="blue" />
        <Stat label="Cash collected" value={inr(sum_.cash)} sub="net of cash refunds" icon={<Banknote className="size-4.5" />} tone="green" />
        <Stat label="UPI collected" value={inr(sum_.upi)} sub={`Card ${inr(sum_.card)}`} icon={<QrCode className="size-4.5" />} tone="brand" />
        <Stat label="Outstanding payments" value={inr(rec.total)} sub={`${rec.byCustomer.size} customers owe`} icon={<Wallet className="size-4.5" />} tone="red" onClick={() => go('payments')} />
        <Stat label="Gross profit" value={inr(sum_.grossProfit)} sub={`${sum_.netSales ? ((sum_.grossProfit / sum_.netSales) * 100).toFixed(1) : 0}% margin (ex-GST)`} icon={<Coins className="size-4.5" />} tone="green" locked={!owner} />
        <Stat label="Est. net profit" value={inr(sum_.netProfit)} sub="after wastage, salaries, rent & expenses" icon={<TrendingUp className="size-4.5" />} tone={sum_.netProfit >= 0 ? 'green' : 'red'} locked={!owner} />
        <Stat label="Low-stock products" value={low.length} sub="at/below minimum level" icon={<PackageX className="size-4.5" />} tone="amber" onClick={() => go('inventory')} />
        <Stat label="Expiring products" value={expiringProducts} sub={`${expiring.filter((x) => x.st === 'Expired').length} batches already expired`} icon={<CalendarX2 className="size-4.5" />} tone="red" onClick={() => go('expiry')} />
        <Stat label={`${label} wastage`} value={inr(sum_.wastage)} sub="cost of spoiled / expired stock" icon={<Trash2 className="size-4.5" />} tone="amber" onClick={() => go('expiry')} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2" title="Sales trend" subtitle={range.from === range.to ? 'Hourly billed amount (incl. GST)' : 'Daily billed amount (incl. GST, net of refunds)'}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: -10, right: 8, top: 8 }}>
                <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8f2f44" stopOpacity={0.25} /><stop offset="100%" stopColor="#8f2f44" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} width={46} />
                <Tooltip formatter={(v: any) => [inr(Number(v)), 'Sales']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="sales" stroke="#8f2f44" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Cash vs UPI vs Card" subtitle="Collections in period (net of refunds)">
          {payTotal === 0 ? <EmptyState title="No collections in this period" /> : (
            <div className="flex items-center gap-4">
              <div className="size-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={payData} dataKey="value" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">{payData.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie><Tooltip formatter={(v: any) => inr(Number(v))} /></PieChart></ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2.5">
                {payData.map((d) => (
                  <li key={d.name} className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: d.color }} />{d.name}</span>
                    <span className="num text-right"><b>{inr(d.value)}</b><span className="text-stone-500 text-xs ml-1.5">{payTotal ? Math.round((d.value / payTotal) * 100) : 0}%</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Top-selling sweets" subtitle="By net sales value"><BarList items={topSweets.map((p) => ({ label: p.name, value: p.rev, sub: `${fmtQty(Math.round(p.qty * 1000) / 1000, p.unit)} sold` }))} format={inr} /></Card>
        <Card title="Best-performing products" subtitle="By gross profit">{owner ? <BarList items={best.map((p) => ({ label: p.name, value: p.gp, sub: `${p.rev ? Math.round((p.gp / p.rev) * 100) : 0}% margin` }))} format={inr} /> : <EmptyState title="Profit data is restricted" hint="Switch to the Owner role to view product margins." />}</Card>
        <Card title="Staff attendance — today" actions={<button className="text-xs text-brand-700 font-medium cursor-pointer" onClick={() => go('staff')}>Manage</button>}>
          <div className="grid grid-cols-4 gap-2 mb-3 text-center">
            {[['Present', attCount('Present'), 'green'], ['Half-day', attCount('Half-day'), 'amber'], ['Leave', attCount('Leave'), 'blue'], ['Absent', attCount('Absent'), 'red']].map(([k, v, t]) => (
              <div key={k as string} className="rounded-lg bg-stone-50 py-2"><div className="text-lg font-semibold num">{v}</div><div className="text-[10px] uppercase tracking-wide text-stone-500">{k}</div></div>
            ))}
          </div>
          <ul className="divide-y divide-stone-100">
            {s.staff.filter((x) => x.active).map((st) => {
              const a = att.find((x) => x.staffId === st.id)
              return (
                <li key={st.id} className="py-1.5 flex items-center justify-between text-[13px]">
                  <span>{st.name}<span className="text-stone-400 text-xs"> · {st.role}</span></span>
                  <span className="flex items-center gap-1.5">{a?.checkIn && <span className="text-[11px] text-stone-500">{fmtTime(a.checkIn)}</span>}{isLate(a, s.settings.openTime, s.settings.lateGraceMin) && <Badge tone="amber">Late</Badge>}{a ? <StatusBadge s={a.status} /> : <Badge>Not marked</Badge>}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Recent transactions" pad={false} actions={<button className="text-xs text-brand-700 font-medium cursor-pointer" onClick={() => go('sales')}>View all</button>}>
          <ul className="divide-y divide-stone-100">
            {recentSales.map((x) => {
              const modes = [...new Set(s.payments.filter((p) => p.saleId === x.id && p.type === 'receipt').map((p) => p.mode))]
              return (
                <li key={x.id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                  <div><div className="font-medium">{x.invoiceNo}</div><div className="text-xs text-stone-500">{x.customerName} · {fmtDate(x.date)}, {fmtTime(x.at)}</div></div>
                  <div className="text-right"><div className="font-semibold num">{inr(x.total)}</div><div className="text-[11px] text-stone-500">{x.status === 'Cancelled' ? 'Cancelled' : modes.join(' + ') || 'On credit'}</div></div>
                </li>
              )
            })}
          </ul>
        </Card>
        <Card title="Recent customer orders" pad={false} actions={<button className="text-xs text-brand-700 font-medium cursor-pointer" onClick={() => go('orders')}>View all</button>}>
          <ul className="divide-y divide-stone-100">
            {recentOrders.map((o) => (
              <li key={o.id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                <div><div className="font-medium">{o.orderNo} · {o.customerName}</div><div className="text-xs text-stone-500">{o.source}{o.festivalId ? ' · Festival' : ''} · due {fmtDate(o.dueDate)} · balance {inr(orderDue(s, o))}</div></div>
                <div className="text-right"><div className="font-semibold num">{inr(o.total)}</div><StatusBadge s={o.status} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Low-stock alerts" pad={false} actions={<Badge tone="amber">{low.length}</Badge>}>
          {!low.length ? <EmptyState title="All products above minimum" /> : (
            <ul className="divide-y divide-stone-100">{low.slice(0, 7).map((p) => (
              <li key={p.id} className="px-4 py-2 flex justify-between text-[13px]"><span>{p.name}</span><span className="num text-right"><b className={sm[p.id].sellable <= 0 ? 'text-red-600' : 'text-amber-700'}>{fmtQty(sm[p.id].sellable, p.unit)}</b><span className="text-stone-400 text-xs"> / min {p.minStock}</span></span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Near-expiry & expired inventory" pad={false} actions={<Badge tone="red">{expiring.length}</Badge>}>
          {!expiring.length ? <EmptyState title="Nothing expiring soon" /> : (
            <ul className="divide-y divide-stone-100">{expiring.slice(0, 7).map(({ b, st }) => {
              const p = s.products.find((x) => x.id === b.productId)!
              return <li key={b.id} className="px-4 py-2 flex justify-between items-center text-[13px]"><span>{p.name}<span className="text-stone-400 text-xs"> · {fmtQty(b.qty, p.unit)}</span></span><StatusBadge s={st} /></li>
            })}</ul>
          )}
        </Card>
        <Card title="Pending supplier payments" pad={false} actions={<Badge tone="amber">{inr(sum(dueInv, (i) => sb.invDue.get(i.id) || 0))}</Badge>}>
          {!dueInv.length ? <EmptyState title="No dues" /> : (
            <ul className="divide-y divide-stone-100">{dueInv.slice(0, 6).map((i) => (
              <li key={i.id} className="px-4 py-2 flex justify-between items-center text-[13px]">
                <span className="min-w-0"><span className="block truncate">{s.suppliers.find((x) => x.id === i.supplierId)?.name}</span><span className="text-[11px] text-stone-500">Due {fmtDate(i.dueDate)}</span></span>
                <span className="text-right"><b className="num">{inr(sb.invDue.get(i.id) || 0)}</b>{i.dueDate < today && <div><Badge tone="red">Overdue</Badge></div>}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      <Card title="Festival order summary" subtitle="All active festival bookings" actions={<button className="text-xs text-brand-700 font-medium cursor-pointer" onClick={() => go('festival')}>Open festival module</button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            [PartyPopper, 'Festival orders', String(festOrders.length)],
            [Receipt, 'Revenue booked', inr(sum(festOrders, (o) => o.total))],
            [Wallet, 'Advance collected', inr(sum(festOrders, (o) => orderPaid(s, o)))],
            [Hourglass, 'Pending payments', inr(sum(festOrders, (o) => orderDue(s, o)))],
          ].map(([Icon, k, v]: any) => (
            <div key={k} className="flex items-center gap-3 rounded-lg bg-stone-50 p-3"><div className="size-9 rounded-lg bg-saffron-100 text-saffron-700 grid place-items-center"><Icon className="size-4.5" /></div><div><div className="text-[11px] uppercase tracking-wide text-stone-500">{k}</div><div className="text-lg font-semibold num">{v}</div></div></div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
          {s.festivals.filter((f) => f.active).map((f) => <Badge key={f.id} tone="brand">{f.name} · {fmtDate(f.date)} · {s.orders.filter((o) => o.festivalId === f.id && o.status !== 'Cancelled').length} orders</Badge>)}
        </div>
      </Card>
    </div>
  )
}
