import { useEffect, useMemo, useState } from 'react'
import { PackageCheck, Pencil, Plus, Wallet, X } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { supplierBalances, supplyFor } from '../lib/calc'
import { can } from '../lib/perm'
import { bus } from '../lib/bus'
import { UPI_PROVIDERS } from '../lib/ops'
import { EXPENSE_CATS, type POItem, type PayMode, type PurchaseInvoice, type PurchaseOrder, type Supplier } from '../lib/types'
import { addDays, dayDiff, fmtDate, fmtQty, inr, inr2, r2, sum, todayStr } from '../lib/util'
import { Badge, Card, DataTable, Field, Modal, NumInput, Notice, PageHeader, run, Stat, StatusBadge, Tabs, confirmDialog, type Col } from '../components/ui'

function SupplierForm({ initial, onClose }: { initial?: Supplier; onClose: () => void }) {
  const s = useStore()
  const [f, setF] = useState({ name: initial?.name || '', contact: initial?.contact || '', phone: initial?.phone || '', address: initial?.address || '', state: initial?.state || s.settings.state, gstin: initial?.gstin || '', terms: initial?.terms ?? 15, supplies: initial?.supplies || '' })
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit supplier' : 'Add supplier'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.saveSupplier({ ...(initial ? { id: initial.id } : {}), ...f, terms: Number(f.terms) } as any), 'Supplier saved').ok && onClose()}>Save supplier</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier name" required className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Contact person"><input className="input" value={f.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
        <Field label="Contact number"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="State"><input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="GSTIN"><input className="input" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
        <Field label="Payment terms (days)"><NumInput value={f.terms} onChange={(v) => set('terms', v)} /></Field>
        <Field label="Supplies"><input className="input" value={f.supplies} onChange={(e) => set('supplies', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function POForm({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const [supplierId, setSupplierId] = useState(s.suppliers[0].id)
  const [date, setDate] = useState(todayStr())
  const [expected, setExpected] = useState(addDays(todayStr(), 3))
  const [notes, setNotes] = useState('')
  const sup = s.suppliers.find((x) => x.id === supplierId)!
  const mine = s.products.filter((p) => !p.archived && p.supplierId === supplierId)
  const blank = (): POItem & { key: string } => { const p = mine[0] || s.products.find((x) => !x.archived)!; return { key: Math.random().toString(36), productId: p.id, name: p.name, unit: p.unit, qty: 1, rate: p.purchasePrice, gstRate: p.gstRate } }
  const [items, setItems] = useState<(POItem & { key: string })[]>([blank()])
  const setItem = (k: string, patch: Partial<POItem>) => setItems((it) => it.map((x) => (x.key === k ? { ...x, ...patch } : x)))
  const total = sum(items, (i) => i.qty * i.rate * (1 + i.gstRate / 100))
  const pickProduct = (k: string, id: string) => {
    if (id === '__non') return setItem(k, { productId: undefined, name: '', unit: 'pc', gstRate: 18, rate: 0, expenseCat: 'Packaging' })
    const p = s.products.find((x) => x.id === id)!
    setItem(k, { productId: p.id, name: p.name, unit: p.unit, rate: p.purchasePrice, gstRate: p.gstRate, expenseCat: undefined })
  }
  return (
    <Modal open onClose={onClose} size="xl" title="New purchase order" subtitle="Choose stock products (added to inventory on receipt) or non-stock items such as packaging (booked as expense on receipt)."
      footer={<><span className="mr-auto text-sm">Estimated total (incl. GST) <b className="num">{inr(total)}</b></span><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.createPO({ supplierId, date, expected, notes, items: items.map(({ key, ...r }) => ({ ...r, qty: Number(r.qty), rate: Number(r.rate), gstRate: Number(r.gstRate) })) }), 'Purchase order created').ok && onClose()}>Create PO</button></>}>
      <div className="grid sm:grid-cols-4 gap-3 mb-4">
        <Field label="Supplier" className="sm:col-span-2"><select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Order date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Expected delivery"><input type="date" className="input" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
      </div>
      <div className="text-xs text-stone-500 mb-2">GST on this order: {supplyFor(s.settings.state, sup.state) === 'intra' ? 'intra-state (CGST + SGST)' : 'inter-state (IGST)'} · payment terms {sup.terms} days</div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1.6fr_1.2fr_90px_100px_80px_32px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500"><span>Item</span><span>Name (non-stock)</span><span>Qty</span><span>Rate ex-GST</span><span>GST %</span><span /></div>
        {items.map((it) => (
          <div key={it.key} className="grid grid-cols-[1.6fr_1.2fr_90px_100px_80px_32px] gap-2 items-center">
            <select className="input" value={it.productId || '__non'} onChange={(e) => pickProduct(it.key, e.target.value)}>{s.products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}{p.supplierId === supplierId ? ' ★' : ''}</option>)}<option value="__non">Non-stock item (packaging…)</option></select>
            {it.productId ? <span className="text-xs text-stone-400">per {it.unit}</span> : <input className="input" placeholder="e.g. Gift ribbons" value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} />}
            <NumInput value={it.qty} onChange={(v) => setItem(it.key, { qty: v })} step="any" />
            <NumInput value={it.rate} onChange={(v) => setItem(it.key, { rate: v })} step="any" />
            <select className="input" value={it.gstRate} onChange={(e) => setItem(it.key, { gstRate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select>
            <button className="btn-ghost btn-icon" disabled={items.length === 1} onClick={() => setItems(items.filter((x) => x.key !== it.key))}><X className="size-4" /></button>
          </div>
        ))}
        <button className="btn-secondary btn-sm" onClick={() => setItems([...items, blank()])}><Plus className="size-3.5" />Add line</button>
      </div>
      <Field label="Notes" className="mt-4"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  )
}

function ReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const s = useStore()
  const sup = s.suppliers.find((x) => x.id === po.supplierId)!
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [invNo, setInvNo] = useState(`${sup.name.split(' ')[0].slice(0, 3).toUpperCase()}/${Math.floor(1000 + Math.random() * 8999)}`)
  const [lines, setLines] = useState(po.items.map((it) => { const p = s.products.find((x) => x.id === it.productId); return { qty: it.qty as number | '', batchNo: '', produced: today, expiry: addDays(today, p?.shelfLife ?? 0) } }))
  const [payAmt, setPayAmt] = useState<number | ''>('')
  const [payMode, setPayMode] = useState<PayMode | 'Bank'>('Bank')
  const setL = (i: number, patch: any) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const taxable = sum(po.items, (it) => (Number(lines[po.items.indexOf(it)].qty) || 0) * it.rate)
  const tax = sum(po.items, (it) => ((Number(lines[po.items.indexOf(it)].qty) || 0) * it.rate * it.gstRate) / 100)
  const inter = supplyFor(s.settings.state, sup.state) === 'inter'
  const submit = () => {
    const r = run(() => act.receivePO(po.id, { date, invNo, lines: lines.map((l, idx) => ({ idx, qty: Number(l.qty) || 0, batchNo: l.batchNo || undefined, produced: l.produced, expiry: l.expiry })), paidNow: payAmt ? { amount: Number(payAmt), mode: payMode } : undefined }), `Goods received — stock, batches & supplier payable updated`)
    if (r.ok) onClose()
  }
  return (
    <Modal open onClose={onClose} size="2xl" title={`Receive goods — ${po.poNo}`} subtitle={`${sup.name} · ordered ${fmtDate(po.date)} · expected ${fmtDate(po.expected)}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><PackageCheck className="size-4" />Confirm receipt & book invoice · {inr(taxable + tax)}</button></>}>
      <div className="grid sm:grid-cols-4 gap-3 mb-4">
        <Field label="Supplier invoice no."><input className="input" value={invNo} onChange={(e) => setInvNo(e.target.value)} /></Field>
        <Field label="Received on"><input type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Pay now (optional ₹)"><NumInput value={payAmt} onChange={setPayAmt} step="any" /></Field>
        <Field label="Payment mode"><select className="input" value={payMode} onChange={(e) => setPayMode(e.target.value as any)}><option>Bank</option><option>Cash</option><option>UPI</option></select></Field>
      </div>
      <table className="w-full text-[13px]">
        <thead><tr><th className="th">Item</th><th className="th text-right">Ordered</th><th className="th w-28">Received qty</th><th className="th">Batch no.</th><th className="th">Produced</th><th className="th">Expiry</th><th className="th text-right">Rate</th><th className="th text-right">Taxable</th></tr></thead>
        <tbody>
          {po.items.map((it, i) => (
            <tr key={i}>
              <td className="td"><b>{it.name}</b>{!it.productId && <div className="text-[11px] text-stone-500">Non-stock → booked as {it.expenseCat || 'Packaging'} expense</div>}</td>
              <td className="td text-right num">{fmtQty(it.qty, it.unit)}</td>
              <td className="td"><NumInput value={lines[i].qty} onChange={(v) => setL(i, { qty: v })} step="any" /></td>
              <td className="td">{it.productId ? <input className="input" placeholder="Auto" value={lines[i].batchNo} onChange={(e) => setL(i, { batchNo: e.target.value })} /> : '—'}</td>
              <td className="td">{it.productId ? <input type="date" className="input" value={lines[i].produced} onChange={(e) => setL(i, { produced: e.target.value })} /> : '—'}</td>
              <td className="td">{it.productId ? <input type="date" className="input" value={lines[i].expiry} onChange={(e) => setL(i, { expiry: e.target.value })} /> : '—'}</td>
              <td className="td text-right num">{inr2(it.rate)}</td>
              <td className="td text-right num">{inr2((Number(lines[i].qty) || 0) * it.rate)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={7} className="td text-right">Taxable value</td><td className="td text-right num">{inr2(taxable)}</td></tr>
          <tr><td colSpan={7} className="td text-right">{inter ? 'IGST (input credit)' : 'CGST + SGST (input credit)'}</td><td className="td text-right num">{inr2(tax)}</td></tr>
          <tr><td colSpan={7} className="td text-right font-semibold">Invoice total / supplier payable</td><td className="td text-right num font-semibold">{inr2(taxable + tax)}</td></tr>
        </tfoot>
      </table>
      <div className="mt-3"><Notice tone="blue">Inventory is valued at cost <b>excluding GST</b> — input GST is tracked separately as a tax asset, not as cost of goods.</Notice></div>
    </Modal>
  )
}

function SupplierPay({ supplierId, invoiceId, onClose }: { supplierId?: string; invoiceId?: string; onClose: () => void }) {
  const s = useStore()
  const sb = supplierBalances(s)
  const [sid, setSid] = useState(supplierId || s.suppliers.find((x) => (sb.bySupplier.get(x.id)?.outstanding || 0) > 0)?.id || s.suppliers[0].id)
  const [inv, setInv] = useState(invoiceId || '')
  const open = s.purchaseInvoices.filter((i) => i.supplierId === sid && (sb.invDue.get(i.id) || 0) > 0.005)
  const max = inv ? sb.invDue.get(inv) || 0 : sb.bySupplier.get(sid)?.outstanding || 0
  const [amount, setAmount] = useState<number | ''>(max)
  const [mode, setMode] = useState<PayMode | 'Bank'>('Bank')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(todayStr())
  useEffect(() => setAmount(Math.round(max * 100) / 100), [sid, inv])
  return (
    <Modal open onClose={onClose} title="Record supplier payment" subtitle="Partial payments are supported. Without a specific invoice, payment settles the oldest due first." footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.paySupplier({ supplierId: sid, invoiceId: inv || undefined, amount: Number(amount), mode, ref: ref || undefined, date }), 'Payment recorded — outstanding updated').ok && onClose()}>Record payment</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier"><select className="input" value={sid} onChange={(e) => { setSid(e.target.value); setInv('') }}>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name} — due {inr(sb.bySupplier.get(x.id)?.outstanding || 0)}</option>)}</select></Field>
        <Field label="Against invoice"><select className="input" value={inv} onChange={(e) => setInv(e.target.value)}><option value="">Oldest dues first</option>{open.map((i) => <option key={i.id} value={i.id}>{i.invNo} — {inr(sb.invDue.get(i.id) || 0)} due {fmtDate(i.dueDate)}</option>)}</select></Field>
        <Field label="Amount (₹)" hint={`Outstanding: ${inr(max)}`}><NumInput value={amount} onChange={setAmount} step="any" /></Field>
        <Field label="Payment date"><input type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}><option>Bank</option><option>Cash</option><option>UPI</option></select></Field>
        <Field label="Reference / UTR"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={mode === 'Cash' ? 'Voucher no.' : 'Auto if blank'} /></Field>
      </div>
    </Modal>
  )
}

export default function Suppliers({ q }: { q: string }) {
  const s = useStore()
  const role = currentUser(s).role
  const today = todayStr()
  const sb = supplierBalances(s)
  const [tab, setTab] = useState<'dir' | 'po' | 'inv' | 'pay'>('dir')
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null)
  const [poForm, setPoForm] = useState(false)
  const [recv, setRecv] = useState<string | null>(null)
  const [pay, setPay] = useState<{ supplierId?: string; invoiceId?: string } | null>(null)
  const [prof, setProf] = useState<string | null>(null)
  useEffect(() => { if (bus.receivePO) { setTab('po'); setRecv(bus.receivePO); bus.receivePO = null } }, [])
  const name = (id: string) => s.suppliers.find((x) => x.id === id)?.name || '—'
  const total = sum([...sb.bySupplier.values()], (b) => b.outstanding)
  const overdue = s.purchaseInvoices.filter((i) => (sb.invDue.get(i.id) || 0) > 0.5 && i.dueDate < today)
  const monthStart = today.slice(0, 8) + '01'

  const dirCols: Col<Supplier>[] = [
    { key: 'name', header: 'Supplier', render: (x) => <div><div className="font-medium">{x.name}</div><div className="text-[11px] text-stone-500">{x.supplies}</div></div>, value: (x) => x.name },
    { key: 'contact', header: 'Contact', render: (x) => <div>{x.contact}<div className="text-[11px] text-stone-500">{x.phone}</div></div>, value: (x) => x.contact + ' ' + x.phone },
    { key: 'gstin', header: 'GSTIN' }, { key: 'state', header: 'State' }, { key: 'terms', header: 'Terms', value: (x) => x.terms, render: (x) => `${x.terms} days` },
    { key: 'inv', header: 'Invoiced', align: 'right', value: (x) => sb.bySupplier.get(x.id)?.invoiced ?? 0, render: (x) => inr(sb.bySupplier.get(x.id)?.invoiced ?? 0) },
    { key: 'out', header: 'Outstanding', align: 'right', value: (x) => sb.bySupplier.get(x.id)?.outstanding ?? 0, render: (x) => { const o = sb.bySupplier.get(x.id)?.outstanding ?? 0; return o > 0.5 ? <b className="text-red-600">{inr(o)}</b> : <span className="text-stone-400">—</span> } },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (x) => <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
      {can(role, 'paySupplier') && (sb.bySupplier.get(x.id)?.outstanding || 0) > 0.5 && <button className="btn-ghost btn-sm btn-icon" title="Record payment" onClick={() => setPay({ supplierId: x.id })}><Wallet className="size-4" /></button>}
      {can(role, 'editSupplier') && <button className="btn-ghost btn-sm btn-icon" title="Edit" onClick={() => setEdit(x)}><Pencil className="size-4" /></button>}</div> },
  ]
  const poCols: Col<PurchaseOrder>[] = [
    { key: 'poNo', header: 'PO', render: (p) => <b>{p.poNo}</b> }, { key: 'sup', header: 'Supplier', value: (p) => name(p.supplierId) }, { key: 'date', header: 'Ordered', value: (p) => p.date, render: (p) => fmtDate(p.date) },
    { key: 'exp', header: 'Expected', value: (p) => p.expected, render: (p) => <span>{fmtDate(p.expected)}{p.status === 'Ordered' && p.expected <= today && <Badge tone={p.expected < today ? 'red' : 'amber'} className="ml-1.5">{p.expected < today ? 'Late' : 'Due today'}</Badge>}</span> },
    { key: 'items', header: 'Items', value: (p) => p.items.map((i) => `${i.name} ${i.qty}`).join(', '), render: (p) => <span className="text-xs text-stone-600">{p.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</span> },
    { key: 'amt', header: 'Est. value', align: 'right', value: (p) => sum(p.items, (i) => i.qty * i.rate * (1 + i.gstRate / 100)), render: (p) => inr(sum(p.items, (i) => i.qty * i.rate * (1 + i.gstRate / 100))) },
    { key: 'st', header: 'Status', value: (p) => p.status, render: (p) => <StatusBadge s={p.status} /> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (p) => p.status === 'Ordered' && <div className="flex gap-1 justify-end"><button className="btn-primary btn-sm" disabled={!can(role, 'receivePO')} onClick={() => setRecv(p.id)}><PackageCheck className="size-3.5" />Receive</button>
      <button className="btn-ghost btn-sm btn-icon" title="Cancel PO" disabled={!can(role, 'createPO')} onClick={async () => { if (await confirmDialog({ title: `Cancel ${p.poNo}?`, message: 'The purchase order will be marked cancelled. No stock or payable is affected.', danger: true, confirmLabel: 'Cancel PO' })) run(() => act.cancelPO(p.id), 'PO cancelled') }}><X className="size-4" /></button></div> },
  ]
  const invStatus = (i: PurchaseInvoice) => { const d = sb.invDue.get(i.id) || 0; return d <= 0.5 ? 'Paid' : i.dueDate < today ? 'Overdue' : d < i.total - 0.5 ? 'Partial' : 'Unpaid' }
  const invCols: Col<PurchaseInvoice>[] = [
    { key: 'grnNo', header: 'GRN', render: (i) => <b>{i.grnNo}</b> }, { key: 'invNo', header: 'Invoice no.' }, { key: 'sup', header: 'Supplier', value: (i) => name(i.supplierId) }, { key: 'date', header: 'Date', value: (i) => i.date, render: (i) => fmtDate(i.date) },
    { key: 'due', header: 'Due date', value: (i) => i.dueDate, render: (i) => fmtDate(i.dueDate) },
    { key: 'items', header: 'Items', value: (i) => i.lines.map((l) => l.name).join(', '), render: (i) => <span className="text-xs text-stone-600">{i.lines.map((l) => l.name).join(', ')}</span> },
    { key: 'taxable', header: 'Taxable', align: 'right', value: (i) => i.taxable, render: (i) => inr(i.taxable) }, { key: 'gst', header: 'GST', align: 'right', value: (i) => i.cgst + i.sgst + i.igst, render: (i) => inr(i.cgst + i.sgst + i.igst) },
    { key: 'total', header: 'Total', align: 'right', value: (i) => i.total, render: (i) => <b>{inr(i.total)}</b> }, { key: 'bal', header: 'Balance', align: 'right', value: (i) => sb.invDue.get(i.id) || 0, render: (i) => ((sb.invDue.get(i.id) || 0) > 0.5 ? <b className="text-red-600">{inr(sb.invDue.get(i.id) || 0)}</b> : '—') },
    { key: 'st', header: 'Status', value: invStatus, render: (i) => <StatusBadge s={invStatus(i)} /> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (i) => (sb.invDue.get(i.id) || 0) > 0.5 && <button className="btn-secondary btn-sm" disabled={!can(role, 'paySupplier')} onClick={() => setPay({ supplierId: i.supplierId, invoiceId: i.id })}>Pay</button> },
  ]
  const payRows = useMemo(() => [...s.supplierPayments].sort((a, b) => b.date.localeCompare(a.date)), [s.supplierPayments])

  return (
    <div>
      <PageHeader title="Suppliers & Purchases" subtitle="Supplier directory, purchase orders, goods received notes, purchase invoices and payments with outstanding tracking."
        actions={<><button className="btn-secondary" disabled={!can(role, 'editSupplier')} onClick={() => setEdit('new')}><Plus className="size-4" />Add supplier</button><button className="btn-secondary" disabled={!can(role, 'paySupplier')} onClick={() => setPay({})}><Wallet className="size-4" />Pay supplier</button><button className="btn-primary" disabled={!can(role, 'createPO')} onClick={() => setPoForm(true)}><Plus className="size-4" />New purchase order</button></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Suppliers" value={s.suppliers.length} /><Stat label="Total payable" value={inr(total)} tone="red" /><Stat label="Overdue invoices" value={overdue.length} sub={inr(sum(overdue, (i) => sb.invDue.get(i.id) || 0))} tone="amber" />
        <Stat label="Open purchase orders" value={s.pos.filter((p) => p.status === 'Ordered').length} tone="blue" /><Stat label="Purchases this month" value={inr(sum(s.purchaseInvoices.filter((i) => i.date >= monthStart), (i) => i.total))} tone="green" />
      </div>
      <Tabs value={tab} onChange={setTab} counts={{ po: s.pos.filter((p) => p.status === 'Ordered').length }} tabs={[{ id: 'dir', label: 'Supplier directory' }, { id: 'po', label: 'Purchase orders' }, { id: 'inv', label: 'Purchase invoices & GRN' }, { id: 'pay', label: 'Payments' }]} />
      {tab === 'dir' && <Card><DataTable columns={dirCols} rows={s.suppliers} rowKey={(x) => x.id} defaultSearch={q} exportName="suppliers" onRowClick={(x) => setProf(x.id)} /></Card>}
      {tab === 'po' && <Card><DataTable columns={poCols} rows={[...s.pos].reverse()} rowKey={(p) => p.id} exportName="purchase-orders" defaultSearch={q} /></Card>}
      {tab === 'inv' && <Card><DataTable columns={invCols} rows={[...s.purchaseInvoices].sort((a, b) => b.date.localeCompare(a.date))} rowKey={(i) => i.id} exportName="purchase-invoices" pageSize={12} /></Card>}
      {tab === 'pay' && <Card><DataTable rows={payRows} rowKey={(p) => p.id} exportName="supplier-payments" columns={[
        { key: 'date', header: 'Date', value: (p) => p.date, render: (p) => fmtDate(p.date) }, { key: 'sup', header: 'Supplier', value: (p) => name(p.supplierId) }, { key: 'amount', header: 'Amount', align: 'right', value: (p) => p.amount, render: (p) => <b>{inr(p.amount)}</b> },
        { key: 'mode', header: 'Mode' }, { key: 'ref', header: 'Reference', value: (p) => p.ref || '' }, { key: 'inv', header: 'Settled invoices', value: (p) => p.allocations.map((a) => s.purchaseInvoices.find((i) => i.id === a.invoiceId)?.invNo).join(', ') }, { key: 'by', header: 'By', value: (p) => p.by || '' },
      ]} /></Card>}
      {edit && <SupplierForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {poForm && <POForm onClose={() => setPoForm(false)} />}
      {recv && s.pos.find((p) => p.id === recv) && <ReceiveModal po={s.pos.find((p) => p.id === recv)!} onClose={() => setRecv(null)} />}
      {pay && <SupplierPay supplierId={pay.supplierId} invoiceId={pay.invoiceId} onClose={() => setPay(null)} />}
      {prof && (() => { const x = s.suppliers.find((y) => y.id === prof)!; const b = sb.bySupplier.get(x.id)!; return (
        <Modal open onClose={() => setProf(null)} size="lg" title={x.name} subtitle={`${x.address} · GSTIN ${x.gstin}`} footer={<button className="btn-secondary" onClick={() => setProf(null)}>Close</button>}>
          <div className="grid grid-cols-3 gap-3 mb-4"><Stat label="Total invoiced" value={inr(b.invoiced)} /><Stat label="Paid" value={inr(b.paid)} tone="green" /><Stat label="Outstanding" value={inr(b.outstanding)} tone="red" /></div>
          <div className="text-[13px] text-stone-600 mb-3">Contact {x.contact} · {x.phone} · terms {x.terms} days · supplies {x.supplies}</div>
          <h4 className="text-[13px] font-semibold mb-2">Purchase history</h4>
          <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg">{s.purchaseInvoices.filter((i) => i.supplierId === x.id).sort((a, b) => b.date.localeCompare(a.date)).map((i) => <li key={i.id} className="px-3 py-2 flex justify-between text-[13px]"><span>{fmtDate(i.date)} · {i.invNo} <span className="text-stone-500">· {i.lines.map((l) => l.name).join(', ')}</span></span><span className="flex items-center gap-2"><b className="num">{inr(i.total)}</b><StatusBadge s={invStatus(i)} /></span></li>)}</ul>
        </Modal>) })()}
    </div>
  )
}
