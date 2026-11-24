import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { batchStatus } from '../lib/calc'
import { can } from '../lib/perm'
import { bus } from '../lib/bus'
import { WASTE_REASONS } from '../lib/constants'
import type { Batch } from '../lib/types'
import { addDays, dayDiff, fmtDate, fmtQty, inr, inr2, r2, sum, todayStr } from '../lib/util'
import { Card, DataTable, Field, Modal, NumInput, Notice, PageHeader, run, Stat, StatusBadge, Tabs, type Col } from '../components/ui'

function WastageModal({ onClose, preset }: { onClose: () => void; preset?: { productId?: string; batchId?: string } }) {
  const s = useStore()
  const user = currentUser(s)
  const withStock = s.products.filter((p) => !p.archived && s.batches.some((b) => b.productId === p.id && b.qty > 0))
  const [pid, setPid] = useState(preset?.productId || withStock[0]?.id)
  const batches = s.batches.filter((b) => b.productId === pid && b.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry))
  const [bid, setBid] = useState(preset?.batchId || '')
  const batch = batches.find((b) => b.id === bid) || batches[0]
  const p = s.products.find((x) => x.id === pid)
  const [qty, setQty] = useState<number | ''>(preset?.batchId ? s.batches.find((b) => b.id === preset.batchId)?.qty ?? '' : '')
  const [reason, setReason] = useState(preset?.batchId ? 'Expired' : 'Spoiled')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const cost = r2((Number(qty) || 0) * (batch?.cost || 0))
  const submit = () => { if (run(() => act.wastage({ productId: pid!, batchId: batch!.id, qty: Number(qty), reason, date, note }), `Wastage recorded — ${inr(cost)} written off, stock reduced`).ok) onClose() }
  return (
    <Modal open onClose={onClose} title="Record wastage" subtitle="Stock is deducted from the selected batch and the cost flows into profit & loss." size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={submit}><Trash2 className="size-4" />Record wastage · {inr(cost)}</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product" required><select className="input" value={pid} onChange={(e) => { setPid(e.target.value); setBid('') }}>{withStock.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Batch number" required><select className="input" value={batch?.id || ''} onChange={(e) => setBid(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo} · {fmtQty(b.qty, p!.unit)} · exp {fmtDate(b.expiry)}{b.expiry < todayStr() ? ' (EXPIRED)' : ''}</option>)}</select></Field>
        <Field label={`Quantity wasted (${p?.unit})`} required hint={batch ? `Available in batch: ${fmtQty(batch.qty, p!.unit)}` : undefined}><NumInput value={qty} onChange={setQty} step="any" /></Field>
        <Field label="Reason" required><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{WASTE_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Date"><input type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Cost of wastage (auto)"><input className="input" readOnly value={inr2(cost)} /></Field>
        <Field label="Recorded by"><input className="input" readOnly value={user.name} /></Field>
        <Field label="Notes"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
      </div>
    </Modal>
  )
}

export default function Expiry({ q }: { q: string }) {
  const s = useStore()
  const role = currentUser(s).role
  const today = todayStr()
  const [tab, setTab] = useState<'expiry' | 'wastage'>('expiry')
  const [bucket, setBucket] = useState<'all' | 'today' | 'two' | 'seven' | 'expired'>('all')
  const [waste, setWaste] = useState<null | { productId?: string; batchId?: string }>(null)
  useEffect(() => {
    const pr = bus.wastagePreset
    if (!pr) return
    bus.wastagePreset = null
    const prod = s.products.find((p) => p.name === pr.product)
    const b = s.batches.filter((x) => x.productId === prod?.id && x.qty > 0 && (!pr.expired || x.expiry < today)).sort((a, c) => a.expiry.localeCompare(c.expiry))[0]
    if (prod) setWaste({ productId: prod.id, batchId: b?.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const live = s.batches.filter((b) => b.qty > 0.0004 && b.locationId === 'main')
  const bk = (b: Batch) => (b.expiry < today ? 'expired' : b.expiry === today ? 'today' : b.expiry <= addDays(today, 2) ? 'two' : b.expiry <= addDays(today, 7) ? 'seven' : 'ok')
  const val = (b: Batch) => b.qty * b.cost
  const by = (k: string) => live.filter((b) => bk(b) === k)
  const rows = live.filter((b) => (bucket === 'all' ? bk(b) !== 'ok' : bk(b) === bucket)).sort((a, b) => a.expiry.localeCompare(b.expiry))
  const pname = (id: string) => s.products.find((p) => p.id === id)?.name || '—'
  const unit = (id: string) => s.products.find((p) => p.id === id)?.unit || 'kg'
  const fefo = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of s.products) { const f = live.filter((b) => b.productId === p.id && b.expiry >= today).sort((a, b) => a.expiry.localeCompare(b.expiry))[0]; if (f) m.set(p.id, f.id) }
    return m
  }, [s.batches])
  const cols: Col<Batch>[] = [
    { key: 'p', header: 'Product', value: (b) => pname(b.productId), render: (b) => <span className="font-medium">{pname(b.productId)}</span> }, { key: 'batchNo', header: 'Batch no.' },
    { key: 'produced', header: 'Produced', value: (b) => b.produced, render: (b) => fmtDate(b.produced) }, { key: 'received', header: 'Received', value: (b) => b.received, render: (b) => fmtDate(b.received) },
    { key: 'expiry', header: 'Expiry', value: (b) => b.expiry, render: (b) => <span>{fmtDate(b.expiry)} <span className="text-[11px] text-stone-500">{(() => { const d = dayDiff(today, b.expiry); return d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `in ${d}d` })()}</span></span> },
    { key: 'qty', header: 'Available', align: 'right', value: (b) => b.qty, render: (b) => fmtQty(b.qty, unit(b.productId)) }, { key: 'cost', header: 'Cost / unit', align: 'right', value: (b) => b.cost, render: (b) => inr(b.cost) },
    { key: 'val', header: 'Value at risk', align: 'right', value: (b) => Math.round(val(b)), render: (b) => inr(val(b)) },
    { key: 'st', header: 'Batch status', value: (b) => batchStatus(b, today, s.products.find((p) => p.id === b.productId)?.shelfLife), render: (b) => <StatusBadge s={batchStatus(b, today, s.products.find((p) => p.id === b.productId)?.shelfLife)} /> },
    { key: 'fefo', header: 'FEFO', noSort: true, noCsv: true, render: (b) => (fefo.get(b.productId) === b.id ? <span className="badge bg-sky-50 text-sky-700 ring-1 ring-sky-200">Sell first</span> : b.expiry < today ? <span className="text-[11px] text-red-600">Do not sell</span> : null) },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (b) => <button className="btn-secondary btn-sm" disabled={!can(role, 'wastage')} onClick={() => setWaste({ productId: b.productId, batchId: b.id })}>Record wastage</button> },
  ]
  const wastage = [...s.wastage].sort((a, b) => b.at.localeCompare(a.at))
  const monthStart = today.slice(0, 8) + '01'
  return (
    <div>
      <PageHeader title="Expiry & Wastage" subtitle="Batch-level shelf-life tracking. FEFO (First Expiry, First Out) is applied automatically at billing."
        actions={<button className="btn-danger" disabled={!can(role, 'wastage')} onClick={() => setWaste({})}><Trash2 className="size-4" />Record wastage</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Expiring today" value={by('today').length} sub={inr(sum(by('today'), val)) + ' at cost'} tone="red" onClick={() => setBucket('today')} />
        <Stat label="Within 2 days" value={by('two').length} sub={inr(sum(by('two'), val)) + ' at cost'} tone="amber" onClick={() => setBucket('two')} />
        <Stat label="Within 7 days" value={by('seven').length} sub={inr(sum(by('seven'), val)) + ' at cost'} tone="blue" onClick={() => setBucket('seven')} />
        <Stat label="Already expired" value={by('expired').length} sub={inr(sum(by('expired'), val)) + ' to write off'} tone="red" onClick={() => setBucket('expired')} />
        <Stat label="Wastage this month" value={inr(sum(s.wastage.filter((w) => w.date >= monthStart), (w) => w.cost))} sub={`${s.wastage.filter((w) => w.date >= monthStart).length} entries`} tone="gray" onClick={() => setTab('wastage')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'expiry', label: 'Expiry dashboard' }, { id: 'wastage', label: 'Wastage log' }]} counts={{ wastage: s.wastage.length }} />
      {tab === 'expiry' && (
        <>
          {by('expired').length > 0 && <div className="mb-3"><Notice tone="red">{by('expired').length} expired batch(es) are still counted in physical stock. They cannot be billed — record wastage to clear them and book the loss.</Notice></div>}
          <Card>
            <DataTable columns={cols} rows={rows} rowKey={(b) => b.id} defaultSearch={q} exportName="expiry-report" pageSize={12}
              empty={<div className="py-10 text-center text-sm text-stone-500">No batches in this window 🎉</div>}
              toolbar={<select className="input !w-48" value={bucket} onChange={(e) => setBucket(e.target.value as any)}><option value="all">All needing attention</option><option value="today">Expiring today</option><option value="two">Within 2 days</option><option value="seven">Within 7 days</option><option value="expired">Already expired</option></select>} />
          </Card>
        </>
      )}
      {tab === 'wastage' && (
        <Card>
          <DataTable rows={wastage} rowKey={(w) => w.id} exportName="wastage-report" pageSize={12} columns={[
            { key: 'date', header: 'Date', value: (w) => w.date, render: (w) => fmtDate(w.date) }, { key: 'p', header: 'Product', value: (w) => pname(w.productId) }, { key: 'b', header: 'Batch', value: (w) => w.batchNo },
            { key: 'qty', header: 'Qty', align: 'right', value: (w) => w.qty, render: (w) => fmtQty(w.qty, unit(w.productId)) }, { key: 'reason', header: 'Reason' },
            { key: 'cost', header: 'Cost', align: 'right', value: (w) => w.cost, render: (w) => <b>{inr(w.cost)}</b> }, { key: 'by', header: 'Recorded by' }, { key: 'note', header: 'Notes', value: (w) => w.note || '' },
          ]} footer={<tfoot><tr><td className="td font-semibold" colSpan={5}>Total wastage cost</td><td className="td text-right font-semibold num">{inr(sum(wastage, (w) => w.cost))}</td><td colSpan={2} /></tr></tfoot>} />
        </Card>
      )}
      {waste && <WastageModal preset={waste} onClose={() => setWaste(null)} />}
    </div>
  )
}
