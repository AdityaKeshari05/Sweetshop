import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { useStore, currentUser } from '../lib/store'
import { cashRegister, customerOutstanding, receivables } from '../lib/calc'
import { can } from '../lib/perm'
import type { Customer, Payment } from '../lib/types'
import { cn, fmtDate, fmtDT, fmtTime, inr, inr2, sum, todayStr } from '../lib/util'
import { Badge, Card, DataTable, Notice, PageHeader, RangePicker, rangeFor, Stat, StatusBadge, Tabs, type Col, type DateRange } from '../components/ui'
import { ReceiveDueModal } from './Customers'

export default function Payments() {
  const s = useStore()
  const role = currentUser(s).role
  const [range, setRange] = useState<DateRange>(rangeFor('today'))
  const [tab, setTab] = useState<'tx' | 'upi' | 'dues' | 'cash' | 'refunds'>('tx')
  const [mode, setMode] = useState('all')
  const [recv, setRecv] = useState<Customer | null>(null)
  const [cashDate, setCashDate] = useState(todayStr())
  const inRange = s.payments.filter((p) => p.date >= range.from && p.date <= range.to)
  const tot = (m: string, t: 'receipt' | 'refund') => sum(inRange.filter((p) => p.mode === m && p.type === t && p.status === 'Success'), (p) => p.amount)
  const rec = receivables(s)
  const link = (p: Payment) => { const sale = s.sales.find((x) => x.id === p.saleId); const o = s.orders.find((x) => x.id === p.orderId); return [sale?.invoiceNo, o?.orderNo].filter(Boolean).join(' / ') || p.note || '—' }
  const cust = (p: Payment) => s.customers.find((c) => c.id === p.customerId)?.name || s.sales.find((x) => x.id === p.saleId)?.customerName || 'Walk-in'
  const cols: Col<Payment>[] = [
    { key: 'at', header: 'Date & time', value: (p) => p.at, render: (p) => fmtDT(p.at) },
    { key: 'type', header: 'Type', render: (p) => <Badge tone={p.type === 'receipt' ? 'green' : 'red'}>{p.type === 'receipt' ? 'Receipt' : 'Refund'}</Badge> },
    { key: 'mode', header: 'Mode', render: (p) => <Badge tone={p.mode === 'UPI' ? 'brand' : p.mode === 'Cash' ? 'green' : 'amber'}>{p.mode}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', value: (p) => (p.type === 'refund' ? -p.amount : p.amount), render: (p) => <b className={p.type === 'refund' ? 'text-red-600' : ''}>{p.type === 'refund' ? '−' : ''}{inr2(p.amount)}</b> },
    { key: 'cust', header: 'Customer', value: cust }, { key: 'ref', header: 'Invoice / order', value: link },
    { key: 'txn', header: 'Reference no.', value: (p) => p.ref || '' }, { key: 'prov', header: 'Provider', value: (p) => p.provider || '' }, { key: 'status', header: 'Status', value: (p) => p.status, render: (p) => <StatusBadge s={p.status} /> },
  ]
  const rows = inRange.filter((p) => mode === 'all' || p.mode === mode).sort((a, b) => b.at.localeCompare(a.at))
  const dues = s.customers.map((c) => ({ c, due: customerOutstanding(s, c) })).filter((x) => x.due > 0).sort((a, b) => b.due - a.due)
  const reg = cashRegister(s, cashDate)
  let running = reg.opening
  return (
    <div>
      <PageHeader title="Payments & Cash" subtitle="Cash, UPI and card collections, customer credit, refunds and the cash register. UPI/card records are simulated — no payment gateway is connected." actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Cash collected" value={inr(tot('Cash', 'receipt'))} tone="green" /><Stat label="UPI collected" value={inr(tot('UPI', 'receipt'))} tone="brand" /><Stat label="Card payments" value={inr(tot('Card', 'receipt'))} tone="amber" />
        <Stat label="Refunds" value={inr(sum(inRange.filter((p) => p.type === 'refund'), (p) => p.amount))} tone="red" /><Stat label="Pending (receivable)" value={inr(rec.total)} tone="blue" /><Stat label="Customers owing" value={rec.byCustomer.size} tone="gray" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'tx', label: 'All transactions' }, { id: 'upi', label: 'UPI records' }, { id: 'dues', label: 'Customer balances' }, { id: 'cash', label: 'Cash register' }, { id: 'refunds', label: 'Refunds' }]} />
      {tab === 'tx' && <Card><DataTable columns={cols} rows={rows} rowKey={(p) => p.id} exportName="payments" pageSize={14} toolbar={<select className="input !w-36" value={mode} onChange={(e) => setMode(e.target.value)}><option value="all">All modes</option><option>Cash</option><option>UPI</option><option>Card</option></select>} /></Card>}
      {tab === 'upi' && (
        <Card>
          <div className="mb-3"><Notice tone="blue">Simulated UPI settlement records for demonstration — references are generated locally, not fetched from a bank or payment provider.</Notice></div>
          <DataTable rowKey={(p) => p.id} exportName="upi-transactions" pageSize={14} rows={inRange.filter((p) => p.mode === 'UPI').sort((a, b) => b.at.localeCompare(a.at))} columns={[
            { key: 'at', header: 'Txn date', value: (p) => p.at, render: (p) => fmtDT(p.at) }, { key: 'ref', header: 'UPI reference no.', render: (p) => <span className="font-mono text-xs">{p.ref}</span>, value: (p) => p.ref || '' },
            { key: 'prov', header: 'Provider', value: (p) => p.provider || '' }, { key: 'amount', header: 'Amount', align: 'right', value: (p) => p.amount, render: (p) => <b className={p.type === 'refund' ? 'text-red-600' : ''}>{p.type === 'refund' ? '−' : ''}{inr2(p.amount)}</b> },
            { key: 'type', header: 'Type', value: (p) => p.type }, { key: 'cust', header: 'Customer', value: cust }, { key: 'for', header: 'Against', value: link }, { key: 'st', header: 'Status', value: (p) => p.status, render: (p) => <StatusBadge s={p.status} /> },
          ]} />
        </Card>
      )}
      {tab === 'dues' && (
        <Card><DataTable rowKey={(x) => x.c.id} rows={dues} exportName="customer-outstanding" searchPlaceholder="Search customer…" columns={[
          { key: 'name', header: 'Customer', value: (x) => x.c.name, render: (x) => <div><b>{x.c.name}</b><div className="text-[11px] text-stone-500">{x.c.mobile}</div></div> }, { key: 'type', header: 'Type', value: (x) => x.c.type },
          { key: 'inv', header: 'Unpaid invoices', align: 'right', value: (x) => rec.dues.filter((d) => d.sale.customerId === x.c.id).length },
          { key: 'old', header: 'Oldest due since', value: (x) => rec.dues.filter((d) => d.sale.customerId === x.c.id).map((d) => d.sale.date).sort()[0], render: (x) => fmtDate(rec.dues.filter((d) => d.sale.customerId === x.c.id).map((d) => d.sale.date).sort()[0]) },
          { key: 'due', header: 'Outstanding', align: 'right', value: (x) => x.due, render: (x) => <b className="text-red-600">{inr(x.due)}</b> },
          { key: 'a', header: '', noSort: true, noCsv: true, render: (x) => <button className="btn-primary btn-sm" disabled={!can(role, 'receiveDue')} onClick={() => setRecv(x.c)}><Wallet className="size-3.5" />Receive</button> },
        ]} /></Card>
      )}
      {tab === 'cash' && (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4">
          <Card title="Cash register" actions={<input type="date" className="input !w-40" value={cashDate} max={todayStr()} onChange={(e) => setCashDate(e.target.value)} />} pad={false}>
            <table className="w-full text-[13px]">
              <thead><tr><th className="th">Time</th><th className="th">Movement</th><th className="th text-right">In / Out</th><th className="th text-right">Running balance</th></tr></thead>
              <tbody>
                <tr><td className="td">{fmtTime(reg.day?.openedAt)}</td><td className="td">Opening cash balance</td><td className="td text-right num">—</td><td className="td text-right num font-medium">{inr2(reg.opening)}</td></tr>
                {reg.entries.map((e, i) => { running += e.amount; return <tr key={i}><td className="td">{e.at.slice(11) === '12:00' ? '—' : fmtTime(e.at)}</td><td className="td">{e.label}</td><td className={cn('td text-right num', e.amount < 0 ? 'text-red-600' : 'text-emerald-700')}>{e.amount < 0 ? '−' : '+'}{inr2(Math.abs(e.amount))}</td><td className="td text-right num">{inr2(running)}</td></tr> })}
                {!reg.entries.length && <tr><td colSpan={4} className="td text-center text-stone-500 py-6">No cash movements on this date</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card title="Cash reconciliation">
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span>Opening cash</span><b className="num">{inr2(reg.opening)}</b></div>
              <div className="flex justify-between text-emerald-700"><span>Cash received</span><b className="num">+{inr2(reg.received)}</b></div>
              <div className="flex justify-between text-red-600"><span>Cash paid out</span><b className="num">−{inr2(reg.paidOut)}</b></div>
              <div className="flex justify-between border-t border-stone-200 pt-2"><span className="font-semibold">Expected cash</span><b className="num text-base">{inr2(reg.expected)}</b></div>
              {reg.day?.actualCash != null ? (
                <>
                  <div className="flex justify-between"><span>Actual cash counted</span><b className="num">{inr2(reg.day.actualCash)}</b></div>
                  <div className={cn('rounded-lg px-3 py-2 flex justify-between font-medium', (reg.day.diff || 0) === 0 ? 'bg-emerald-50 text-emerald-700' : (reg.day.diff || 0) < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}><span>{(reg.day.diff || 0) === 0 ? 'Tallied' : (reg.day.diff || 0) < 0 ? 'Shortage' : 'Excess'}</span><span className="num">{inr2(Math.abs(reg.day.diff || 0))}</span></div>
                </>
              ) : <Notice tone="blue">Actual cash is entered during shop closing (Shop Operations).</Notice>}
            </div>
          </Card>
        </div>
      )}
      {tab === 'refunds' && (
        <Card><DataTable rowKey={(p) => p.id} exportName="refunds" rows={s.payments.filter((p) => p.type === 'refund' && p.date >= range.from && p.date <= range.to).sort((a, b) => b.at.localeCompare(a.at))} columns={cols.filter((c) => c.key !== 'type')} empty={<div className="py-10 text-center text-sm text-stone-500">No refunds in this period</div>} /></Card>
      )}
      {recv && <ReceiveDueModal customer={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}
