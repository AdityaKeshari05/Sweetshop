import { useEffect, useMemo, useState } from 'react'
import { Ban, Check, CircleDot, Eye, Pencil, Plus, Printer, Sparkles, Wallet, X } from 'lucide-react'
import { useStore, act, actions, getState } from '../lib/store'
import { computeBill, orderDue, orderPaid, supplyFor, stockMap } from '../lib/calc'
import { orderFlow, UPI_PROVIDERS } from '../lib/ops'
import { ORDER_KINDS, ORDER_SOURCES, type Festival, type Order, type PayMode } from '../lib/types'
import { bus } from '../lib/bus'
import { addDays, cn, fmtDate, fmtDT, fmtQty, fmtTime, inr, inr2, r3, sum, todayStr, dayDiff } from '../lib/util'
import { Badge, Card, DataTable, Field, Modal, NumInput, Notice, PageHeader, run, Segmented, Stat, StatusBadge, toast, type Col } from '../components/ui'
import { CustomerPicker } from '../components/CustomerPicker'
import { InvoiceModal } from '../components/Invoice'
import { ReasonModal } from '../components/ReasonModal'

type Mode = 'orders' | 'online' | 'festival'
const FESTIVAL_PRESETS = ['Diwali', 'Durga Puja', 'Holi', 'Raksha Bandhan', 'Eid', 'Christmas', 'New Year']
const KIND_TONE: Record<string, any> = { Regular: 'gray', Advance: 'blue', Bulk: 'amber', 'Custom Box': 'purple', 'Corporate Gifting': 'brand' }

/* ---------------- order form ---------------- */
function OrderForm({ initial, mode, festivalId, onClose }: { initial?: Order; mode: Mode; festivalId?: string; onClose: () => void }) {
  const s = useStore()
  const locked = !!initial?.stockDeducted
  const [customerId, setCustomerId] = useState<string | undefined>(initial?.customerId)
  const [source, setSource] = useState<Order['source']>(initial?.source || (mode === 'online' ? 'Phone' : mode === 'festival' ? 'Phone' : 'Walk-in'))
  const [kind, setKind] = useState<Order['kind']>(initial?.kind || (mode === 'festival' ? 'Corporate Gifting' : 'Advance'))
  const [fest, setFest] = useState(initial?.festivalId || festivalId || '')
  const [items, setItems] = useState<{ productId: string; qty: number | ''; rate: number | '' }[]>(initial ? initial.items.map((i) => ({ productId: i.productId, qty: i.qty, rate: i.rate })) : [{ productId: s.products.find((p) => !p.archived)!.id, qty: 1, rate: '' }])
  const [discount, setDiscount] = useState<number | ''>(initial?.discount || '')
  const [dueDate, setDueDate] = useState(initial?.dueDate || addDays(todayStr(), 2))
  const [dueTime, setDueTime] = useState(initial?.dueTime || '12:00')
  const [delivery, setDelivery] = useState<Order['delivery']>(initial?.delivery || 'Pickup')
  const [address, setAddress] = useState(initial?.deliveryAddress || '')
  const [packaging, setPackaging] = useState(initial?.packaging || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [advAmt, setAdvAmt] = useState<number | ''>('')
  const [advMode, setAdvMode] = useState<PayMode>('UPI')
  const cust = s.customers.find((c) => c.id === customerId)
  const supply = initial?.supply || supplyFor(s.settings.state, cust?.state)
  const resolved = items.map((i) => { const p = s.products.find((x) => x.id === i.productId)!; return { productId: p.id, name: p.name, unit: p.unit, hsn: p.hsn, gstRate: p.gstRate, qty: Number(i.qty) || 0, rate: i.rate === '' ? p.sellPrice : Number(i.rate) } })
  const bill = computeBill(resolved, Number(discount) || 0, supply, s.settings.pricesIncludeGst)
  const setItem = (k: number, patch: any) => setItems(items.map((it, i) => (i === k ? { ...it, ...patch } : it)))
  const save = () => {
    const payload = { items: resolved.map((r) => ({ productId: r.productId, qty: r.qty, rate: r.rate })), discount: Number(discount) || 0, dueDate, dueTime, delivery, deliveryAddress: address, packaging, notes, kind, festivalId: fest || undefined }
    const r = initial
      ? run(() => act.updateOrder(initial.id, locked ? { dueDate, dueTime, delivery, deliveryAddress: address, packaging, notes, kind, festivalId: fest || undefined } : payload), 'Order updated')
      : run(() => act.createOrder({ ...payload, customerId: customerId!, source, advance: advAmt ? { amount: Number(advAmt), mode: advMode } : undefined, acceptance: 'Accepted', paymentTerms: advAmt ? 'Advance' : 'COD' } as any), 'Order recorded')
    if (r.ok) onClose()
  }
  const sm = stockMap(s)
  return (
    <Modal open onClose={onClose} size="xl" title={initial ? `Edit ${initial.orderNo}` : mode === 'festival' ? 'New festival order' : 'New customer order'} subtitle={locked ? 'Items are locked — stock has already been allocated for preparation.' : 'Record phone, WhatsApp, walk-in advance, bulk or custom-box orders.'}
      footer={<><span className="mr-auto text-sm text-stone-600">Order total <b className="num text-stone-900 text-base">{inr(bill.total)}</b></span><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>{initial ? 'Save changes' : 'Create order'}</button></>}>
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-3.5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><CustomerPicker label="Customer *" value={customerId} onChange={setCustomerId} allowWalkIn={false} /></div>
            <Field label="Order source"><select className="input" value={source} disabled={!!initial} onChange={(e) => setSource(e.target.value as any)}>{ORDER_SOURCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Order type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}>{ORDER_KINDS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Festival (optional)"><select className="input" value={fest} onChange={(e) => setFest(e.target.value)}><option value="">— none —</option>{s.festivals.map((f) => <option key={f.id} value={f.id}>{f.name} · {fmtDate(f.date)}</option>)}</select></Field>
            <Field label="Fulfilment"><select className="input" value={delivery} onChange={(e) => setDelivery(e.target.value as any)}><option>Pickup</option><option>Delivery</option></select></Field>
            <Field label="Delivery / pickup date" required><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <Field label="Time slot"><input type="time" className="input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} /></Field>
            {delivery === 'Delivery' && <Field label="Delivery address" className="sm:col-span-2"><input className="input" value={address || cust?.address || ''} onChange={(e) => setAddress(e.target.value)} /></Field>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><span className="label !mb-0">Items</span>{!locked && <button className="btn-secondary btn-sm" onClick={() => setItems([...items, { productId: s.products.find((p) => !p.archived)!.id, qty: 1, rate: '' }])}><Plus className="size-3.5" />Add item</button>}</div>
            <div className="space-y-2">
              {items.map((it, k) => {
                const p = s.products.find((x) => x.id === it.productId)!
                return (
                  <div key={k} className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-center">
                    <select className="input" value={it.productId} disabled={locked} onChange={(e) => setItem(k, { productId: e.target.value, rate: '' })}>{s.products.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                    <div className="relative"><NumInput value={it.qty} onChange={(v) => setItem(k, { qty: v })} step="any" disabled={locked} /><span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 pointer-events-none">{p.unit}</span></div>
                    <NumInput value={it.rate} onChange={(v) => setItem(k, { rate: v })} placeholder={String(p.sellPrice)} step="any" disabled={locked} />
                    {!locked && items.length > 1 ? <button className="btn-ghost btn-icon" onClick={() => setItems(items.filter((_, i) => i !== k))}><X className="size-4" /></button> : <span className="w-8" />}
                    <div className="col-span-4 -mt-1 text-[11px] text-stone-500 pl-1">In stock: {fmtQty(sm[p.id].sellable, p.unit)} · rate ₹{p.sellPrice}/{p.unit}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Custom packaging / box instructions"><input className="input" value={packaging} onChange={(e) => setPackaging(e.target.value)} placeholder="e.g. Branded sleeves, gold ribbon" /></Field>
            <Field label="Order notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 text-[13px] space-y-1.5">
            <div className="flex justify-between"><span>Subtotal</span><span className="num">{inr2(bill.subtotal)}</span></div>
            <Field label="Discount (₹)"><NumInput value={discount} onChange={setDiscount} disabled={locked} step="any" /></Field>
            <div className="flex justify-between"><span>Taxable value</span><span className="num">{inr2(bill.taxable)}</span></div>
            <div className="flex justify-between"><span>{supply === 'intra' ? 'CGST + SGST' : 'IGST'}</span><span className="num">{inr2(bill.tax)}</span></div>
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold text-base"><span>Total</span><span className="num">{inr(bill.total)}</span></div>
            <div className="text-[11px] text-stone-500">{supply === 'intra' ? 'Intra-state supply (CGST + SGST)' : 'Inter-state supply (IGST)'}</div>
          </div>
          {!initial && (
            <div className="rounded-xl border border-stone-200 p-3.5 space-y-2">
              <div className="text-[13px] font-semibold">Advance payment</div>
              <div className="grid grid-cols-2 gap-2"><Field label="Amount (₹)"><NumInput value={advAmt} onChange={setAdvAmt} step="any" /></Field><Field label="Mode"><select className="input" value={advMode} onChange={(e) => setAdvMode(e.target.value as PayMode)}><option>UPI</option><option>Cash</option><option>Card</option></select></Field></div>
              <div className="flex gap-1.5">{[25, 50].map((p) => <button key={p} className="kbd cursor-pointer !py-1" onClick={() => setAdvAmt(Math.round((bill.total * p) / 100))}>{p}%</button>)}</div>
              <div className="text-xs text-stone-500">Balance due: <b className="num">{inr(Math.max(0, bill.total - (Number(advAmt) || 0)))}</b></div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- deliver / cancel ---------------- */
function DeliverModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const s = useStore()
  const due = orderDue(s, order)
  const [amount, setAmount] = useState<number | ''>(due)
  const [mode, setMode] = useState<PayMode>('UPI')
  const [credit, setCredit] = useState(false)
  const submit = () => {
    const r = run(() => act.advanceOrder(order.id, { collect: credit ? undefined : { mode, amount: Number(amount) || 0 }, allowCredit: credit }), `${order.orderNo} delivered — invoice generated`)
    if (r.ok) onClose()
  }
  return (
    <Modal open onClose={onClose} size="sm" title={`Deliver ${order.orderNo}`} subtitle="A GST invoice is generated and revenue is recognised on delivery." footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Confirm delivery</button></>}>
      <div className="text-sm mb-3">Order total <b>{inr(order.total)}</b> · paid <b>{inr(orderPaid(s, order))}</b> · balance <b className="text-red-600">{inr(due)}</b></div>
      {due > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />Keep balance as customer credit (collect later)</label>
          {!credit && <div className="grid grid-cols-2 gap-3"><Field label="Collect now (₹)"><NumInput value={amount} onChange={setAmount} /></Field><Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as PayMode)}><option>UPI</option><option>Cash</option><option>Card</option></select></Field></div>}
        </div>
      )}
      {due === 0 && <Notice tone="green">Fully paid — nothing to collect.</Notice>}
    </Modal>
  )
}

function CancelOrder({ order, onClose }: { order: Order; onClose: () => void }) {
  const s = useStore()
  const paid = orderPaid(s, order)
  const [refund, setRefund] = useState(true)
  const [mode, setMode] = useState<PayMode>('UPI')
  return (
    <ReasonModal title={`Cancel ${order.orderNo}`} danger confirmLabel="Cancel order" presets={['Customer cancelled', 'Unable to fulfil', 'Duplicate order']} onClose={onClose}
      onSubmit={(reason) => { if (run(() => act.cancelOrder(order.id, { reason, refundMode: paid > 0 && refund ? mode : undefined }), `${order.orderNo} cancelled${order.stockDeducted ? ' — reserved stock released' : ''}`).ok) onClose() }}>
      {order.stockDeducted && <Notice tone="blue">Stock already allocated to this order will be restored to its batches (no duplicate deduction).</Notice>}
      {paid > 0 && (
        <div className="rounded-lg border border-stone-200 p-3 space-y-2">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />Refund {inr(paid)} received</label>
          {refund && <select className="input" value={mode} onChange={(e) => setMode(e.target.value as PayMode)}><option>UPI</option><option>Cash</option><option>Card</option></select>}
        </div>
      )}
    </ReasonModal>
  )
}

/* ---------------- detail ---------------- */
function PayModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const s = useStore()
  const [amount, setAmount] = useState<number | ''>(orderDue(s, order))
  const [mode, setMode] = useState<PayMode>('UPI')
  const [ref, setRef] = useState('')
  const [provider, setProvider] = useState(UPI_PROVIDERS[0])
  return (
    <Modal open onClose={onClose} size="sm" title={`Record payment — ${order.orderNo}`} subtitle={`Balance due ${inr(orderDue(s, order))}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.orderPayment(order.id, { amount: Number(amount), mode, ref: ref || undefined, provider }), 'Payment recorded').ok && onClose()}>Record</button></>}>
      <div className="grid grid-cols-2 gap-3"><Field label="Amount (₹)"><NumInput value={amount} onChange={setAmount} /></Field><Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as PayMode)}><option>UPI</option><option>Cash</option><option>Card</option></select></Field>
        {mode === 'UPI' && <><Field label="Provider"><select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{UPI_PROVIDERS.map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="UPI reference" hint="Simulated if blank"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field></>}</div>
    </Modal>
  )
}

function Stepper({ order }: { order: Order }) {
  const flow = orderFlow(order)
  const idx = order.status === 'Cancelled' ? -1 : flow.indexOf(order.status)
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {flow.map((st, i) => (
        <div key={st} className="flex items-center gap-1 shrink-0">
          <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium', i < idx ? 'bg-emerald-50 text-emerald-700' : i === idx ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-400')}>{i < idx ? <Check className="size-3" /> : <CircleDot className="size-3" />}{st}</div>
          {i < flow.length - 1 && <div className={cn('h-px w-4', i < idx ? 'bg-emerald-300' : 'bg-stone-200')} />}
        </div>
      ))}
      {order.status === 'Cancelled' && <Badge tone="red">Cancelled</Badge>}
    </div>
  )
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore()
  const order = s.orders.find((o) => o.id === id)
  const [edit, setEdit] = useState(false)
  const [pay, setPay] = useState(false)
  const [del, setDel] = useState(false)
  const [cancel, setCancel] = useState(false)
  const [reject, setReject] = useState(false)
  const [inv, setInv] = useState(false)
  if (!order) return null
  const flow = orderFlow(order)
  const next = flow[flow.indexOf(order.status) + 1]
  const paid = orderPaid(s, order)
  const due = orderDue(s, order)
  const closed = order.status === 'Delivered' || order.status === 'Cancelled'
  const fest = s.festivals.find((f) => f.id === order.festivalId)
  const sale = s.sales.find((x) => x.id === order.saleId)
  const pays = s.payments.filter((p) => p.orderId === order.id)
  return (
    <Modal open onClose={onClose} size="xl" title={<span className="flex items-center gap-2">{order.orderNo}<StatusBadge s={order.status} />{order.acceptance === 'Pending' && <Badge tone="amber">Awaiting acceptance</Badge>}{fest && <Badge tone="brand">{fest.name}</Badge>}</span>} subtitle={`${order.customerName} · placed ${fmtDT(order.at)} via ${order.source}`}
      footer={
        <>
          <div className="mr-auto flex gap-2">
            {!closed && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="size-4" />Edit</button>}
            {!closed && <button className="btn-secondary text-red-600" onClick={() => setCancel(true)}><Ban className="size-4" />Cancel order</button>}
            {sale && <button className="btn-secondary" onClick={() => setInv(true)}><Printer className="size-4" />Invoice</button>}
          </div>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {order.acceptance === 'Pending' ? (
            <>
              <button className="btn-secondary text-red-600" onClick={() => setReject(true)}><X className="size-4" />Reject</button>
              <button className="btn-primary" onClick={() => run(() => act.decideOrder(order.id, true), 'Order accepted')}><Check className="size-4" />Accept order</button>
            </>
          ) : !closed && next ? (
            <button className="btn-primary" onClick={() => (next === 'Delivered' ? setDel(true) : run(() => act.advanceOrder(order.id), `${order.orderNo} → ${next}${next === 'Preparing' ? ' (stock allocated)' : ''}`))}>Move to “{next}”</button>
          ) : null}
        </>
      }>
      <div className="mb-4"><Stepper order={order} /></div>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div>
          <table className="w-full text-[13px]">
            <thead><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th text-right">Amount</th></tr></thead>
            <tbody>{order.items.map((i, k) => <tr key={k}><td className="td">{i.name}</td><td className="td text-right num">{fmtQty(i.qty, i.unit)}</td><td className="td text-right num">{inr(i.rate)}</td><td className="td text-right num">{inr(i.qty * i.rate)}</td></tr>)}</tbody>
            <tfoot>
              {order.discount > 0 && <tr><td colSpan={3} className="td text-right text-emerald-700">Discount</td><td className="td text-right num text-emerald-700">-{inr(order.discount)}</td></tr>}
              <tr><td colSpan={3} className="td text-right font-semibold">Total (incl. GST)</td><td className="td text-right num font-semibold">{inr(order.total)}</td></tr>
            </tfoot>
          </table>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] mt-4">
            <div><span className="text-stone-500">{order.delivery === 'Delivery' ? 'Delivery' : 'Pickup'} date:</span> <b>{fmtDate(order.dueDate)}</b> {order.dueTime && <>at {fmtTime(order.dueTime)}</>}</div>
            <div><span className="text-stone-500">Type:</span> <Badge tone={KIND_TONE[order.kind]}>{order.kind}</Badge></div>
            {order.delivery === 'Delivery' && <div className="sm:col-span-2"><span className="text-stone-500">Deliver to:</span> {order.deliveryAddress || '—'}</div>}
            {order.packaging && <div className="sm:col-span-2"><span className="text-stone-500">Packaging:</span> {order.packaging}</div>}
            {order.notes && <div className="sm:col-span-2"><span className="text-stone-500">Notes:</span> {order.notes}</div>}
            {order.platformRef && <div><span className="text-stone-500">Platform ref:</span> {order.platformRef}</div>}
            <div><span className="text-stone-500">Stock:</span> {order.stockDeducted ? <Badge tone="green">Allocated</Badge> : <Badge>Not yet allocated</Badge>}</div>
            {order.cancelReason && <div className="sm:col-span-2 text-red-700">Cancelled: {order.cancelReason}</div>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-stone-200 p-3.5">
            <div className="flex justify-between text-[13px]"><span>Order total</span><b className="num">{inr(order.total)}</b></div>
            <div className="flex justify-between text-[13px] mt-1"><span>Advance / paid</span><b className="num text-emerald-700">{inr(paid)}</b></div>
            <div className="flex justify-between text-[13px] mt-1"><span>Balance due</span><b className={cn('num', due > 0 ? 'text-red-600' : 'text-stone-500')}>{inr(due)}</b></div>
            <div className="mt-2"><StatusBadge s={due <= 0.5 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'} /></div>
            {order.status !== 'Cancelled' && due > 0.5 && <button className="btn-accent btn-sm w-full mt-3" onClick={() => setPay(true)}><Wallet className="size-3.5" />Record payment</button>}
            {pays.length > 0 && <ul className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-[12px] text-stone-600">{pays.map((p) => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.date)} · {p.mode}{p.ref ? ` · ${p.ref}` : ''}</span><span className={cn('num', p.type === 'refund' && 'text-red-600')}>{p.type === 'refund' ? '−' : '+'}{inr(p.amount)}</span></li>)}</ul>}
          </div>
          <div>
            <div className="text-[13px] font-semibold mb-2">Activity</div>
            <ol className="space-y-2 border-l border-stone-200 ml-1.5 pl-4">
              {[...order.history].reverse().map((h, i) => <li key={i} className="relative text-[12px]"><span className="absolute -left-[21px] top-1 size-2 rounded-full bg-brand-600" /><b>{h.status}</b> <span className="text-stone-500">· {fmtDT(h.at)} · {h.by}</span>{h.note && <div className="text-stone-500">{h.note}</div>}</li>)}
            </ol>
          </div>
        </div>
      </div>
      {edit && <OrderForm initial={order} mode="orders" onClose={() => setEdit(false)} />}
      {pay && <PayModal order={order} onClose={() => setPay(false)} />}
      {del && <DeliverModal order={order} onClose={() => setDel(false)} />}
      {cancel && <CancelOrder order={order} onClose={() => setCancel(false)} />}
      {reject && <ReasonModal title="Reject order" danger confirmLabel="Reject order" presets={['Item out of stock', 'Cannot deliver to location', 'Shop closed on date']} onClose={() => setReject(false)} onSubmit={(r) => run(() => act.decideOrder(order.id, false, r), 'Order rejected — any prepayment refunded').ok && setReject(false)} />}
      {inv && sale && <InvoiceModal sale={sale} onClose={() => setInv(false)} />}
    </Modal>
  )
}

/* ---------------- festival form ---------------- */
function FestivalForm({ initial, onClose }: { initial?: Festival; onClose: () => void }) {
  const [name, setName] = useState(initial?.name || 'Diwali')
  const [custom, setCustom] = useState('')
  const [date, setDate] = useState(initial?.date || addDays(todayStr(), 14))
  const [notes, setNotes] = useState(initial?.notes || '')
  return (
    <Modal open onClose={onClose} size="sm" title={initial ? 'Edit festival' : 'Create festival'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.saveFestival({ ...(initial ? { id: initial.id } : {}), name: name === 'Custom' ? custom : name, date, notes } as any), 'Festival saved').ok && onClose()}>Save</button></>}>
      <div className="space-y-3">
        <Field label="Festival"><select className="input" value={FESTIVAL_PRESETS.includes(name) ? name : 'Custom'} onChange={(e) => setName(e.target.value)}>{[...FESTIVAL_PRESETS, 'Custom'].map((f) => <option key={f}>{f}</option>)}</select></Field>
        {!FESTIVAL_PRESETS.includes(name) && <Field label="Festival name"><input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
        <Field label="Festival date" hint="Festival dates vary each year — set the actual date."><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/* ---------------- page ---------------- */
export default function Orders({ mode, q }: { mode: Mode; q: string }) {
  const s = useStore()
  const today = todayStr()
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState(false)
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [festId, setFestId] = useState<string>(() => s.festivals.find((f) => f.id === 'fes_diwali')?.id || s.festivals[0]?.id)
  const [festForm, setFestForm] = useState<Festival | 'new' | null>(null)
  const [view, setView] = useState<'orders' | 'customers'>('orders')

  useEffect(() => { if (q) { const o = s.orders.find((x) => x.orderNo === q); if (o) setSel(o.id) } }, [q])

  const base = s.orders.filter((o) => (mode === 'orders' ? true : mode === 'online' ? o.source !== 'Walk-in' : o.festivalId === festId))
  const rows = base.filter((o) => (status === 'all' ? true : status === 'pending' ? !['Delivered', 'Cancelled'].includes(o.status) : status === 'awaiting' ? o.acceptance === 'Pending' : o.status === status) && (source === 'all' || o.source === source)).sort((a, b) => b.at.localeCompare(a.at))
  const live = base.filter((o) => o.status !== 'Cancelled')
  const open = live.filter((o) => o.status !== 'Delivered')
  const upcoming = open.filter((o) => dayDiff(today, o.dueDate) <= 7).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const fest = s.festivals.find((f) => f.id === festId)

  const simulate = () => {
    const st = getState()
    const sm = stockMap(st)
    const cust = st.customers.filter((c) => c.state === st.settings.state && c.type !== 'Corporate')[Math.floor(Math.random() * 10)]
    const pool = st.products.filter((p) => !p.archived && sm[p.id].sellable > 3 && p.category !== 'Gift Boxes')
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3))
    const src = (['Website', 'WhatsApp', 'Delivery Partner', 'Website'] as const)[Math.floor(Math.random() * 4)]
    const items = picks.map((p) => ({ productId: p.id, qty: p.unit === 'kg' ? [0.5, 1, 1.5][Math.floor(Math.random() * 3)] : p.unit === 'pc' ? 10 : 1 }))
    const prepaid = src !== 'WhatsApp'
    const r = run(() => act.createOrder({ customerId: cust.id, source: src, kind: 'Regular', items, dueDate: today, dueTime: '18:00', delivery: 'Delivery', paymentTerms: prepaid ? 'Prepaid' : 'COD', acceptance: 'Pending', advance: prepaid ? { amount: 0, mode: 'UPI', full: true } : undefined, platformRef: (src === 'Website' ? 'WEB-' : src === 'WhatsApp' ? 'WA-' : 'QB-') + Math.floor(10000 + Math.random() * 89999) } as any), 'New online order received (simulated)')
    if (r.ok) setStatus('awaiting')
  }

  const cols: Col<Order>[] = [
    { key: 'orderNo', header: 'Order', render: (o) => <div><div className="font-medium">{o.orderNo}</div><div className="text-[11px] text-stone-500">{fmtDate(o.at.slice(0, 10))}</div></div> },
    { key: 'customerName', header: 'Customer', render: (o) => <div><div className="font-medium">{o.customerName}</div><div className="text-[11px] text-stone-500 truncate max-w-48">{o.items.map((i) => `${i.name} ${fmtQty(i.qty, i.unit)}`).join(', ')}</div></div>, value: (o) => o.customerName + ' ' + o.items.map((i) => i.name).join(' ') },
    { key: 'source', header: 'Source / type', render: (o) => <div className="flex flex-col gap-1 items-start"><Badge tone="gray">{o.source}</Badge>{o.kind !== 'Regular' && <Badge tone={KIND_TONE[o.kind]}>{o.kind}</Badge>}</div>, value: (o) => o.source + ' ' + o.kind },
    { key: 'total', header: 'Total', align: 'right', value: (o) => o.total, render: (o) => <b>{inr(o.total)}</b> },
    { key: 'paid', header: 'Paid', align: 'right', value: (o) => orderPaid(s, o), render: (o) => inr(orderPaid(s, o)) },
    { key: 'due', header: 'Balance', align: 'right', value: (o) => orderDue(s, o), render: (o) => (orderDue(s, o) > 0.5 ? <b className="text-red-600">{inr(orderDue(s, o))}</b> : <span className="text-stone-400">—</span>) },
    { key: 'dueDate', header: 'Due', value: (o) => o.dueDate, render: (o) => { const d = dayDiff(today, o.dueDate); const done = ['Delivered', 'Cancelled'].includes(o.status); return <div>{fmtDate(o.dueDate)}<div className={cn('text-[11px]', !done && d < 0 ? 'text-red-600 font-medium' : !done && d <= 1 ? 'text-amber-700' : 'text-stone-500')}>{o.delivery}{!done && (d < 0 ? ` · ${-d}d overdue` : d === 0 ? ' · today' : d === 1 ? ' · tomorrow' : '')}</div></div> } },
    { key: 'status', header: 'Status', value: (o) => o.status, render: (o) => <div className="flex flex-col gap-1 items-start"><StatusBadge s={o.status} />{o.acceptance === 'Pending' && <Badge tone="amber">Needs decision</Badge>}{o.acceptance === 'Rejected' && <Badge tone="red">Rejected</Badge>}</div> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (o) => <button className="btn-ghost btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); setSel(o.id) }}><Eye className="size-4" /></button> },
  ]

  const titles = { orders: ['Customer Orders', 'Walk-in, phone, WhatsApp, advance, bulk and custom-box orders with advance payments, balances and delivery tracking.'], online: ['Online Orders', 'Simulated orders arriving from the website, WhatsApp, phone and a delivery partner. Accept or reject, then move each order through its lifecycle.'], festival: ['Festival Orders', 'Bulk sweet boxes, corporate gifting and custom packaging for the festival season — with advances, balances and delivery deadlines.'] } as const
  const byCustomer = useMemo(() => {
    const m = new Map<string, Order[]>()
    for (const o of live) m.set(o.customerId, [...(m.get(o.customerId) || []), o])
    return [...m.entries()].map(([id, os]) => ({ id, name: os[0].customerName, os, total: sum(os, (o) => o.total), paid: sum(os, (o) => orderPaid(s, o)), due: sum(os, (o) => orderDue(s, o)) })).sort((a, b) => b.total - a.total)
  }, [live, s.payments])

  return (
    <div>
      <PageHeader title={titles[mode][0]} subtitle={titles[mode][1]}
        actions={<>
          {mode === 'online' && <button className="btn-secondary" onClick={simulate}><Sparkles className="size-4" />Simulate incoming order</button>}
          {mode === 'festival' && <><button className="btn-secondary" onClick={() => setFestForm('new')}><Plus className="size-4" />New festival</button></>}
          <button className="btn-primary" onClick={() => setForm(true)}><Plus className="size-4" />{mode === 'festival' ? 'New festival order' : 'New order'}</button></>} />

      {mode === 'festival' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {s.festivals.map((f) => { const n = s.orders.filter((o) => o.festivalId === f.id && o.status !== 'Cancelled').length; const d = dayDiff(today, f.date); return (
            <button key={f.id} onClick={() => setFestId(f.id)} className={cn('rounded-xl border px-4 py-2.5 text-left cursor-pointer transition-colors', festId === f.id ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white hover:border-stone-300')}>
              <div className="flex items-center gap-2"><span className="font-semibold text-[13px]">{f.name}</span>{!f.active && <Badge>Past</Badge>}</div>
              <div className="text-[11px] text-stone-500">{fmtDate(f.date)} · {d > 0 ? `${d} days to go` : d === 0 ? 'today' : `${-d}d ago`} · {n} orders</div>
            </button>) })}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {mode === 'festival' ? (
          <>
            <Stat label="Total festival orders" value={live.length} sub={fest?.name} tone="brand" />
            <Stat label="Revenue booked" value={inr(sum(live, (o) => o.total))} tone="green" />
            <Stat label="Advance collected" value={inr(sum(live, (o) => orderPaid(s, o)))} tone="blue" />
            <Stat label="Pending payments" value={inr(sum(live, (o) => orderDue(s, o)))} tone="red" />
            <Stat label="Pending preparation" value={live.filter((o) => ['Received', 'Confirmed'].includes(o.status)).length} sub={`${upcoming.length} deadlines in next 7 days`} tone="amber" />
          </>
        ) : (
          <>
            <Stat label="Open orders" value={open.length} tone="blue" /><Stat label={mode === 'online' ? 'Awaiting acceptance' : 'Due in next 7 days'} value={mode === 'online' ? base.filter((o) => o.acceptance === 'Pending').length : upcoming.length} tone="amber" />
            <Stat label="Order value (open)" value={inr(sum(open, (o) => o.total))} tone="green" /><Stat label="Balance to collect" value={inr(sum(open, (o) => orderDue(s, o)))} tone="red" /><Stat label="Delivered" value={live.filter((o) => o.status === 'Delivered').length} />
          </>
        )}
      </div>

      {upcoming.length > 0 && (
        <Card className="mb-4" title="Upcoming deliveries & pickups" subtitle="Next 7 days (overdue first)">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcoming.slice(0, 8).map((o) => { const d = dayDiff(today, o.dueDate); return (
              <button key={o.id} onClick={() => setSel(o.id)} className="shrink-0 w-56 text-left rounded-lg border border-stone-200 p-3 hover:border-brand-400 cursor-pointer bg-white">
                <div className="flex justify-between items-center"><b className="text-[13px]">{o.orderNo}</b><span className={cn('text-[11px] font-medium', d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-700' : 'text-stone-500')}>{d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : fmtDate(o.dueDate)}</span></div>
                <div className="text-xs text-stone-600 truncate mt-0.5">{o.customerName}</div>
                <div className="flex items-center justify-between mt-2"><StatusBadge s={o.status} /><span className="num text-xs font-semibold">{inr(o.total)}</span></div>
              </button>) })}
          </div>
        </Card>
      )}

      <Card>
        {mode === 'festival' && fest && (
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-[13px] text-stone-600">{fest.notes}</div>
            <div className="flex gap-2"><Segmented size="sm" value={view} onChange={setView} options={[{ id: 'orders', label: 'Order tracking' }, { id: 'customers', label: 'Customer-wise' }]} /><button className="btn-secondary btn-sm" onClick={() => setFestForm(fest)}><Pencil className="size-3.5" />Edit festival</button></div>
          </div>
        )}
        {mode === 'festival' && view === 'customers' ? (
          <DataTable searchable={false} rows={byCustomer} rowKey={(c) => c.id} exportName="festival-customerwise" columns={[
            { key: 'name', header: 'Customer', render: (c) => <b>{c.name}</b> }, { key: 'n', header: 'Orders', align: 'right', value: (c) => c.os.length },
            { key: 'items', header: 'Items', value: (c) => c.os.flatMap((o) => o.items.map((i) => `${i.name} ×${i.qty}`)).join('; '), render: (c) => <span className="text-xs text-stone-600">{c.os.flatMap((o) => o.items.map((i) => `${i.name} ×${i.qty}`)).join(', ')}</span> },
            { key: 'total', header: 'Booked', align: 'right', value: (c) => c.total, render: (c) => inr(c.total) }, { key: 'paid', header: 'Advance paid', align: 'right', value: (c) => c.paid, render: (c) => inr(c.paid) },
            { key: 'due', header: 'Balance', align: 'right', value: (c) => c.due, render: (c) => (c.due > 0.5 ? <b className="text-red-600">{inr(c.due)}</b> : '—') },
            { key: 'st', header: 'Progress', value: (c) => c.os.map((o) => o.status).join(', '), render: (c) => <div className="flex gap-1 flex-wrap">{c.os.map((o) => <StatusBadge key={o.id} s={o.status} />)}</div> },
          ]} />
        ) : (
          <DataTable columns={cols} rows={rows} rowKey={(o) => o.id} defaultSearch={q.startsWith('ORD') ? '' : q} exportName={mode + '-orders'} onRowClick={(o) => setSel(o.id)} searchPlaceholder="Search order, customer, item…"
            toolbar={<>
              <select className="input !w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">All open</option>{mode === 'online' && <option value="awaiting">Awaiting decision</option>}{['Received', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'].map((x) => <option key={x}>{x}</option>)}</select>
              {mode !== 'festival' && <select className="input !w-40" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">All sources</option>{ORDER_SOURCES.map((x) => <option key={x}>{x}</option>)}</select>}</>} />
        )}
      </Card>
      {sel && <OrderDetail id={sel} onClose={() => setSel(null)} />}
      {form && <OrderForm mode={mode} festivalId={mode === 'festival' ? festId : undefined} onClose={() => setForm(false)} />}
      {festForm && <FestivalForm initial={festForm === 'new' ? undefined : festForm} onClose={() => setFestForm(null)} />}
    </div>
  )
}
