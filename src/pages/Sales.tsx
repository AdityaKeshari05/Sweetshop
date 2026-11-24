import { useMemo, useState } from 'react'
import { Eye, RotateCcw, XCircle } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { saleDue, paymentsBySale } from '../lib/calc'
import { can } from '../lib/perm'
import type { PayMode, Sale } from '../lib/types'
import { fmtDate, fmtQty, fmtTime, inr, inr2, r2, sum } from '../lib/util'
import { Badge, Card, DataTable, Field, Modal, NumInput, PageHeader, RangePicker, rangeFor, run, Stat, StatusBadge, toast, type Col, type DateRange } from '../components/ui'
import { InvoiceModal } from '../components/Invoice'
import { ReasonModal } from '../components/ReasonModal'

function RefundModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [qty, setQty] = useState<Record<number, number>>({})
  const [mode, setMode] = useState<PayMode | 'Adjust'>('Cash')
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('Quality complaint')
  const amount = r2(sale.lines.reduce((a, l, i) => a + (l.total * (qty[i] || 0)) / l.qty, 0))
  const submit = () => {
    const r = run(() => act.refundSale(sale.id, { items: Object.entries(qty).map(([idx, q]) => ({ idx: +idx, qty: q })), mode, reason, restock }), 'Refund recorded')
    if (r.ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Refund — ${sale.invoiceNo}`} subtitle="Select the items and quantities being returned" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={amount <= 0} onClick={submit}>Refund {inr2(amount)}</button></>}>
      <table className="w-full text-[13px] mb-4">
        <thead><tr><th className="th">Item</th><th className="th text-right">Sold</th><th className="th text-right">Already refunded</th><th className="th text-right">Return qty ({'kg / pc'})</th><th className="th text-right">Value</th></tr></thead>
        <tbody>
          {sale.lines.map((l, i) => {
            const max = l.qty - l.refundedQty
            return (
              <tr key={i}>
                <td className="td">{l.name}</td><td className="td text-right num">{fmtQty(l.qty, l.unit)}</td><td className="td text-right num">{l.refundedQty ? fmtQty(l.refundedQty, l.unit) : '—'}</td>
                <td className="td w-36"><NumInput value={qty[i] ?? ''} step={l.unit === 'kg' ? 0.1 : 1} min={0} placeholder={`max ${max}`} onChange={(v) => setQty({ ...qty, [i]: Math.min(Number(v) || 0, max) })} disabled={max <= 0} /></td>
                <td className="td text-right num">{inr2(((qty[i] || 0) * l.total) / l.qty)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Refund method"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="Cash">Cash</option><option value="UPI">UPI (simulated)</option><option value="Card">Card</option><option value="Adjust">Adjust against customer dues</option></select></Field>
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Return items to stock (untick if food cannot be resold — cost stays in COGS)</label>
      </div>
    </Modal>
  )
}

export default function Sales({ q }: { q: string }) {
  const s = useStore()
  const role = currentUser(s).role
  const [range, setRange] = useState<DateRange>(rangeFor('month'))
  const [status, setStatus] = useState('all')
  const [view, setView] = useState<Sale | null>(null)
  const [refund, setRefund] = useState<Sale | null>(null)
  const [cancel, setCancel] = useState<Sale | null>(null)
  const paid = paymentsBySale(s)
  const rows = useMemo(() => s.sales.filter((x) => x.date >= range.from && x.date <= range.to && (status === 'all' || (status === 'due' ? saleDue(s, x) > 0.5 : status === 'refunded' ? x.refundedAmount > 0 : x.status === status))).sort((a, b) => b.at.localeCompare(a.at)), [s, range, status])
  const live = rows.filter((x) => x.status === 'Completed')
  const modes = (x: Sale) => [...new Set(s.payments.filter((p) => p.saleId === x.id && p.type === 'receipt').map((p) => p.mode))].join(' + ') || '—'
  const cols: Col<Sale>[] = [
    { key: 'invoiceNo', header: 'Invoice', render: (x) => <span className="font-medium">{x.invoiceNo}</span> },
    { key: 'at', header: 'Date & time', value: (x) => x.at, render: (x) => <>{fmtDate(x.date)}, {fmtTime(x.at)}</> },
    { key: 'customerName', header: 'Customer' },
    { key: 'source', header: 'Source', render: (x) => <Badge tone={x.source === 'Order' ? 'purple' : 'gray'}>{x.source}</Badge> },
    { key: 'items', header: 'Items', value: (x) => x.lines.length, align: 'right' },
    { key: 'total', header: 'Total', align: 'right', render: (x) => <b>{inr(x.total)}</b>, value: (x) => x.total },
    { key: 'refunded', header: 'Refunded', align: 'right', value: (x) => x.refundedAmount, render: (x) => (x.refundedAmount ? <span className="text-red-600">{inr(x.refundedAmount)}</span> : '—') },
    { key: 'mode', header: 'Paid via', value: modes },
    { key: 'due', header: 'Due', align: 'right', value: (x) => saleDue(s, x), render: (x) => (saleDue(s, x) > 0.5 ? <b className="text-red-600">{inr(saleDue(s, x))}</b> : '—') },
    { key: 'status', header: 'Status', value: (x) => (x.status === 'Cancelled' ? 'Cancelled' : x.refundedAmount >= x.total - 0.5 ? 'Refunded' : x.refundedAmount > 0 ? 'Part refunded' : 'Completed'), render: (x) => <StatusBadge s={x.status === 'Cancelled' ? 'Cancelled' : x.refundedAmount >= x.total - 0.5 ? 'Refunded' : x.refundedAmount > 0 ? 'Partial' : 'Completed'} /> },
    {
      key: 'act', header: '', noSort: true, noCsv: true, render: (x) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost btn-sm btn-icon" title="View / print" onClick={() => setView(x)}><Eye className="size-4" /></button>
          <button className="btn-ghost btn-sm btn-icon" title={can(role, 'refund') ? 'Refund' : 'Manager approval required'} disabled={!can(role, 'refund') || x.status === 'Cancelled'} onClick={() => setRefund(x)}><RotateCcw className="size-4" /></button>
          <button className="btn-ghost btn-sm btn-icon text-red-600" title={can(role, 'cancelSale') ? 'Cancel invoice' : 'Manager approval required'} disabled={!can(role, 'cancelSale') || x.status === 'Cancelled' || x.source === 'Order'} onClick={() => setCancel(x)}><XCircle className="size-4" /></button>
        </div>
      ),
    },
  ]
  void paid
  return (
    <div>
      <PageHeader title="Sales & Invoices" subtitle="Every POS bill and delivered-order invoice. Cancellations and refunds restore stock and reverse payments automatically." actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Invoices" value={live.length} />
        <Stat label="Billed (incl. GST)" value={inr(sum(live, (x) => x.total))} tone="green" />
        <Stat label="Refunded" value={inr(sum(live, (x) => x.refundedAmount))} tone="red" />
        <Stat label="Receivable" value={inr(sum(live, (x) => saleDue(s, x)))} tone="amber" />
      </div>
      <Card pad>
        <DataTable columns={cols} rows={rows} rowKey={(x) => x.id} defaultSearch={q} exportName="invoices" onRowClick={(x) => setView(x)} searchPlaceholder="Search invoice, customer…"
          toolbar={<select className="input !w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option><option value="refunded">With refunds</option><option value="due">With balance due</option></select>} />
      </Card>
      <InvoiceModal sale={view ? s.sales.find((x) => x.id === view.id) || view : null} onClose={() => setView(null)} />
      {refund && <RefundModal sale={s.sales.find((x) => x.id === refund.id)!} onClose={() => setRefund(null)} />}
      {cancel && <ReasonModal title={`Cancel ${cancel.invoiceNo}`} danger confirmLabel="Cancel invoice" presets={['Billing error', 'Customer cancelled', 'Duplicate bill']} onClose={() => setCancel(null)}
        onSubmit={(r) => { if (run(() => act.cancelSale(cancel.id, r), `${cancel.invoiceNo} cancelled — stock restored, payments refunded`).ok) setCancel(null) }}>
        <p className="text-sm text-stone-600">Stock for all unreturned items is restored to its original batches and every payment received is refunded to the original mode.</p>
      </ReasonModal>}
    </div>
  )
}
