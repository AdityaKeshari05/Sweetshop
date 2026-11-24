// Pure business operations that mutate a *draft* State. They throw Error(message) on validation failure;
// the store only commits when an operation returns normally (so partial changes are never persisted).
import type {
  Alloc, AttStatus, Batch, Customer, Expense, Festival, Order, OrderItem, OrderStatus, PayMode, Payment, Product, PurchaseInvoice,
  PurchaseOrder, Refund, Sale, Staff, State, Supplier, POItem, LedgerType,
} from './types'
import { computeBill, supplyFor, sumAllocCost, periodSummary, cashRegister, clearMemo, type BillItem } from './calc'
import { addDays, fyLabel, nowISO, r2, r3, sum, uid, dayDiff } from './util'

let clock: string | null = null
export const setClock = (c: string | null) => { clock = c }
export const NOW = () => clock ?? nowISO()
export const TODAY = () => NOW().slice(0, 10)
const EPS = 0.0004

export const UPI_PROVIDERS = ['PhonePe', 'Google Pay', 'Paytm', 'BHIM UPI', 'Amazon Pay']
export const upiRef = () => String(Math.floor(1e11 + Math.random() * 9e11)) + String(Math.floor(Math.random() * 90 + 10))
const pad = (n: number, w: number) => String(n).padStart(w, '0')
export const byUser = (d: State) => d.users.find((u) => u.id === d.userId)?.name ?? 'System'

/* ---------------- stock primitives ---------------- */
function ledger(d: State, e: { productId: string; batch?: Batch; batchId?: string; batchNo?: string; type: LedgerType; qty: number; ref?: string; note?: string; locationId?: string; at?: string }) {
  d.ledger.push({
    id: uid('led'), at: e.at ?? NOW(), productId: e.productId, batchId: e.batch?.id ?? e.batchId, batchNo: e.batch?.batchNo ?? e.batchNo,
    type: e.type, qty: r3(e.qty), ref: e.ref, note: e.note, locationId: e.locationId ?? e.batch?.locationId ?? 'main', by: byUser(d),
  })
}

export function allocateFEFO(d: State, productId: string, qty: number, label: string): Alloc[] {
  const today = TODAY()
  const bs = d.batches
    .filter((b) => b.productId === productId && b.locationId === 'main' && b.qty > EPS && b.expiry >= today)
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.received.localeCompare(b.received))
  let need = qty
  const out: Alloc[] = []
  for (const b of bs) {
    if (need <= EPS) break
    const t = Math.min(b.qty, need)
    out.push({ batchId: b.id, batchNo: b.batchNo, qty: r3(t), cost: b.cost })
    need = r3(need - t)
  }
  if (need > EPS) {
    const have = r3(qty - need)
    throw new Error(`Insufficient stock for ${label}: need ${qty}, only ${have} available (non-expired).`)
  }
  return out
}

function applyOut(d: State, allocs: Alloc[], productId: string, type: LedgerType, ref: string, writeLedger = true) {
  for (const a of allocs) {
    const b = d.batches.find((x) => x.id === a.batchId)
    if (!b) continue
    b.qty = r3(b.qty - a.qty)
    if (b.qty < -EPS) throw new Error('Stock would go negative for batch ' + b.batchNo)
    if (writeLedger) ledger(d, { productId, batch: b, type, qty: -a.qty, ref })
  }
}

function restoreAllocs(d: State, productId: string, allocs: Alloc[], qty: number, type: LedgerType, ref: string) {
  let rem = qty
  for (const a of allocs) {
    if (rem <= EPS) break
    const avail = r3(a.qty - (a.returned || 0))
    const t = Math.min(avail, rem)
    if (t <= EPS) continue
    a.returned = r3((a.returned || 0) + t)
    rem = r3(rem - t)
    let b = d.batches.find((x) => x.id === a.batchId)
    if (!b) {
      const p = d.products.find((x) => x.id === productId)
      b = {
        id: uid('bat'), productId, batchNo: `RET-${TODAY().slice(2).replace(/-/g, '')}-${pad(++d.counters.batch, 3)}`, produced: TODAY(), received: TODAY(),
        expiry: addDays(TODAY(), Math.max(1, Math.min(p?.shelfLife ?? 2, 2))), qty: 0, initialQty: 0, cost: a.cost, locationId: 'main',
      }
      d.batches.push(b)
    }
    b.qty = r3(b.qty + t)
    ledger(d, { productId, batch: b, type, qty: t, ref })
  }
}

function paidFor(d: State, key: 'saleId' | 'orderId', id: string) {
  let v = 0
  for (const p of d.payments) if (p[key] === id && p.status !== 'Failed') v += p.type === 'receipt' ? p.amount : -p.amount
  return r2(v)
}
const saleDueOf = (d: State, s: Sale) => (s.status === 'Cancelled' ? 0 : Math.max(0, r2(s.total - s.refundedAmount - paidFor(d, 'saleId', s.id))))

function addPayment(d: State, p: { mode: PayMode; type: 'receipt' | 'refund'; amount: number; ref?: string; provider?: string; saleId?: string; orderId?: string; customerId?: string; note?: string; at?: string }) {
  const at = p.at ?? NOW()
  const rec: Payment = {
    id: uid('pay'), at, date: at.slice(0, 10), mode: p.mode, type: p.type, amount: r2(p.amount),
    ref: p.ref || (p.mode === 'UPI' ? upiRef() : p.mode === 'Card' ? 'CARD-' + Math.floor(1000 + Math.random() * 9000) : undefined),
    provider: p.mode === 'UPI' ? p.provider || UPI_PROVIDERS[0] : p.mode === 'Card' ? p.provider || 'POS Terminal' : undefined,
    status: 'Success', saleId: p.saleId, orderId: p.orderId, customerId: p.customerId, note: p.note, by: byUser(d),
  }
  d.payments.push(rec)
  return rec
}

/* ---------------- products & stock ---------------- */
export function opAddProduct(d: State, p: Omit<Product, 'id' | 'sku'> & { sku?: string }, openingQty = 0): Product {
  if (!p.name.trim()) throw new Error('Product name is required')
  if (p.sellPrice <= 0) throw new Error('Selling price must be greater than 0')
  if (d.products.some((x) => !x.archived && x.name.toLowerCase() === p.name.trim().toLowerCase())) throw new Error('A product with this name already exists')
  const sku = p.sku?.trim() || `SMB-${++d.counters.sku}`
  if (d.products.some((x) => x.sku === sku)) throw new Error('SKU already in use')
  const prod: Product = { ...p, name: p.name.trim(), sku, id: uid('prd') }
  d.products.push(prod)
  if (openingQty > 0) addBatch(d, prod, { qty: openingQty, cost: prod.purchasePrice, type: 'opening' })
  return prod
}
export function opUpdateProduct(d: State, id: string, patch: Partial<Product>) {
  const p = d.products.find((x) => x.id === id)
  if (!p) throw new Error('Product not found')
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Product name is required')
  if (patch.sellPrice !== undefined && patch.sellPrice <= 0) throw new Error('Selling price must be greater than 0')
  if (patch.sku && d.products.some((x) => x.id !== id && x.sku === patch.sku)) throw new Error('SKU already in use')
  Object.assign(p, patch)
}
export function opDeleteProduct(d: State, id: string) {
  const p = d.products.find((x) => x.id === id)
  if (!p) throw new Error('Product not found')
  const open = d.orders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled' && o.items.some((i) => i.productId === id))
  if (open.length) throw new Error(`Used in ${open.length} open order(s) (${open[0].orderNo}). Complete or cancel them first.`)
  p.archived = true
  d.batches = d.batches.filter((b) => b.productId !== id || b.qty > EPS)
}

function addBatch(d: State, p: Product, o: { qty: number; cost: number; batchNo?: string; produced?: string; expiry?: string; received?: string; type: LedgerType; ref?: string; note?: string; supplierId?: string; locationId?: string }): Batch {
  const today = TODAY()
  const produced = o.produced || today
  const b: Batch = {
    id: uid('bat'), productId: p.id, batchNo: o.batchNo || `B-${today.slice(2).replace(/-/g, '')}-${pad(++d.counters.batch, 3)}`, produced, received: o.received || today,
    expiry: o.expiry || addDays(produced, p.shelfLife), qty: r3(o.qty), initialQty: r3(o.qty), cost: o.cost, locationId: o.locationId || 'main', supplierId: o.supplierId,
  }
  d.batches.push(b)
  ledger(d, { productId: p.id, batch: b, type: o.type, qty: o.qty, ref: o.ref, note: o.note })
  return b
}

export function opAdjustStock(d: State, i: { productId: string; mode: 'add' | 'reduce'; qty: number; batchId?: string; batchNo?: string; produced?: string; expiry?: string; cost?: number; reason: string }) {
  const p = d.products.find((x) => x.id === i.productId)
  if (!p) throw new Error('Select a product')
  if (!(i.qty > 0)) throw new Error('Quantity must be greater than 0')
  if (!i.reason.trim()) throw new Error('Reason is required')
  if (i.mode === 'add') {
    if (i.expiry && i.produced && i.expiry < i.produced) throw new Error('Expiry cannot be before production date')
    addBatch(d, p, { qty: i.qty, cost: i.cost ?? p.purchasePrice, batchNo: i.batchNo, produced: i.produced, expiry: i.expiry, type: 'adjust-in', note: i.reason })
  } else {
    const b = d.batches.find((x) => x.id === i.batchId)
    if (!b) throw new Error('Select a batch to reduce')
    if (i.qty > b.qty + EPS) throw new Error(`Batch only has ${b.qty} available`)
    b.qty = r3(b.qty - i.qty)
    ledger(d, { productId: p.id, batch: b, type: 'adjust-out', qty: -i.qty, note: i.reason })
  }
}

export function opTransfer(d: State, i: { batchId: string; qty: number; toLocation: string }) {
  const b = d.batches.find((x) => x.id === i.batchId)
  if (!b) throw new Error('Batch not found')
  if (!(i.qty > 0) || i.qty > b.qty + EPS) throw new Error('Invalid transfer quantity')
  if (b.locationId === i.toLocation) throw new Error('Choose a different destination')
  b.qty = r3(b.qty - i.qty)
  ledger(d, { productId: b.productId, batch: b, type: 'transfer-out', qty: -i.qty, note: `to ${d.locations.find((l) => l.id === i.toLocation)?.name}` })
  let t = d.batches.find((x) => x.productId === b.productId && x.batchNo === b.batchNo && x.locationId === i.toLocation)
  if (!t) { t = { ...b, id: uid('bat'), qty: 0, initialQty: 0, locationId: i.toLocation }; d.batches.push(t) }
  t.qty = r3(t.qty + i.qty)
  t.initialQty = r3(t.initialQty + i.qty)
  ledger(d, { productId: b.productId, batch: t, type: 'transfer-in', qty: i.qty, note: `from ${d.locations.find((l) => l.id === b.locationId)?.name}` })
}

export function opWastage(d: State, i: { productId: string; batchId: string; qty: number; reason: string; date: string; note?: string }) {
  const b = d.batches.find((x) => x.id === i.batchId)
  if (!b) throw new Error('Select a batch')
  if (!(i.qty > 0)) throw new Error('Quantity must be greater than 0')
  if (i.qty > b.qty + EPS) throw new Error(`Only ${b.qty} available in batch ${b.batchNo}`)
  b.qty = r3(b.qty - i.qty)
  const cost = r2(i.qty * b.cost)
  const at = i.date === TODAY() ? NOW() : i.date + 'T12:00'
  d.wastage.push({ id: uid('wst'), date: i.date, at, productId: b.productId, batchId: b.id, batchNo: b.batchNo, qty: r3(i.qty), reason: i.reason, cost, by: byUser(d), note: i.note })
  ledger(d, { productId: b.productId, batch: b, type: 'wastage', qty: -i.qty, ref: i.reason, at })
}

/* ---------------- sales ---------------- */
export interface SaleInput {
  customerId?: string
  customerName?: string
  items: { productId: string; qty: number; rate?: number }[]
  discount?: number
  discountNote?: string
  payments: { mode: PayMode; amount: number; ref?: string; provider?: string }[]
  supply?: 'intra' | 'inter'
  note?: string
  at?: string
  noStock?: boolean
  noLedger?: boolean
  cashier?: string
}

export function opCreateSale(d: State, i: SaleInput): Sale {
  if (!i.items.length) throw new Error('Cart is empty')
  const cust = i.customerId ? d.customers.find((c) => c.id === i.customerId) : undefined
  const supply = i.supply ?? supplyFor(d.settings.state, cust?.state)
  const items: BillItem[] = i.items.map((it) => {
    const p = d.products.find((x) => x.id === it.productId)
    if (!p) throw new Error('Product not found')
    if (!(it.qty > 0)) throw new Error(`Invalid quantity for ${p.name}`)
    return { productId: p.id, name: p.name, unit: p.unit, hsn: p.hsn, gstRate: p.gstRate, qty: r3(it.qty), rate: it.rate ?? p.sellPrice }
  })
  const bill = computeBill(items, i.discount || 0, supply, d.settings.pricesIncludeGst)
  const at = i.at ?? NOW()
  const invoiceNo = `SMB/${fyLabel(at.slice(0, 10))}/${pad(++d.counters.invoice, 5)}`
  for (const l of bill.lines) {
    if (i.noStock) {
      const p = d.products.find((x) => x.id === l.productId)!
      l.allocs = [{ batchId: 'HIST', qty: l.qty, cost: p.purchasePrice }]
    } else {
      l.allocs = allocateFEFO(d, l.productId, l.qty, l.name)
      applyOut(d, l.allocs, l.productId, 'sale', invoiceNo, !i.noLedger)
    }
    l.cogs = r2(sumAllocCost(l.allocs))
  }
  const pays = i.payments.filter((p) => p.amount > 0)
  const paid = r2(sum(pays, (p) => p.amount))
  if (paid > bill.total + 0.5) throw new Error('Payments exceed the bill total')
  const due = r2(bill.total - paid)
  if (due > 0.5) {
    if (!cust) throw new Error('Select a registered customer to sell on credit')
    clearMemo(d)
    const outstanding = d.sales.reduce((s, x) => (x.customerId === cust.id ? s + saleDueOf(d, x) : s), 0)
    if (cust.creditLimit > 0 && outstanding + due > cust.creditLimit) throw new Error(`Credit limit exceeded (limit ₹${cust.creditLimit}, outstanding ₹${r2(outstanding)})`)
  }
  const sale: Sale = {
    id: uid('sale'), invoiceNo, at, date: at.slice(0, 10), customerId: cust?.id, customerName: cust?.name || i.customerName || 'Walk-in Customer',
    customerMobile: cust?.mobile, customerGstin: cust?.gstin, customerState: cust?.state, supply, lines: bill.lines, subtotal: bill.subtotal,
    discount: bill.discount, discountNote: i.discountNote, taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst, roundOff: bill.roundOff,
    total: bill.total, status: 'Completed', source: 'POS', cashier: i.cashier || byUser(d), refunds: [], refundedAmount: 0, note: i.note,
  }
  d.sales.push(sale)
  for (const p of pays) addPayment(d, { ...p, type: 'receipt', saleId: sale.id, customerId: cust?.id, at })
  return sale
}

export function opCancelSale(d: State, id: string, reason: string) {
  const s = d.sales.find((x) => x.id === id)
  if (!s) throw new Error('Invoice not found')
  if (s.status === 'Cancelled') throw new Error('Invoice already cancelled')
  if (s.source === 'Order') throw new Error('This invoice belongs to an order — cancel/refund via the order or use a refund')
  if (!reason.trim()) throw new Error('Cancellation reason is required')
  s.lines.forEach((l) => {
    const rem = r3(l.qty - l.refundedQty)
    if (rem > EPS) restoreAllocs(d, l.productId, l.allocs, rem, 'cancel-in', s.invoiceNo)
  })
  const byMode: Record<string, number> = {}
  for (const p of d.payments) if (p.saleId === id && p.status !== 'Failed') byMode[p.mode] = (byMode[p.mode] || 0) + (p.type === 'receipt' ? p.amount : -p.amount)
  for (const [m, amt] of Object.entries(byMode)) if (amt > 0.004) addPayment(d, { mode: m as PayMode, type: 'refund', amount: amt, saleId: id, customerId: s.customerId, note: 'Invoice cancelled: ' + reason })
  s.status = 'Cancelled'
  s.cancelReason = reason
}

export function opRefundSale(d: State, id: string, i: { items: { idx: number; qty: number }[]; mode: PayMode | 'Adjust'; reason: string; restock: boolean }): Refund {
  const s = d.sales.find((x) => x.id === id)
  if (!s) throw new Error('Invoice not found')
  if (s.status === 'Cancelled') throw new Error('Cannot refund a cancelled invoice')
  if (!i.reason.trim()) throw new Error('Refund reason is required')
  const items = i.items.filter((x) => x.qty > 0)
  if (!items.length) throw new Error('Select at least one item to refund')
  const lines: Refund['lines'] = []
  for (const it of items) {
    const l = s.lines[it.idx]
    const max = r3(l.qty - l.refundedQty)
    if (it.qty > max + EPS) throw new Error(`Cannot refund more than ${max} of ${l.name}`)
    const ratio = it.qty / l.qty
    const amount = r2(l.total * ratio)
    const taxable = r2(l.taxable * ratio)
    const cogs = i.restock ? r2(l.cogs * ratio) : 0
    if (i.restock) restoreAllocs(d, l.productId, l.allocs, it.qty, 'refund-in', s.invoiceNo)
    l.refundedQty = r3(l.refundedQty + it.qty)
    lines.push({ idx: it.idx, qty: it.qty, amount, taxable, tax: r2(amount - taxable), cogs })
  }
  const amount = r2(sum(lines, (x) => x.amount))
  const netPaid = paidFor(d, 'saleId', id)
  const after = r2(s.total - s.refundedAmount - amount)
  const payoutMax = Math.max(0, r2(netPaid - after))
  const payout = i.mode === 'Adjust' ? 0 : Math.min(amount, payoutMax)
  const at = NOW()
  const ref: Refund = {
    id: uid('ref'), at, date: at.slice(0, 10), lines, amount, taxable: r2(sum(lines, (x) => x.taxable)), tax: r2(sum(lines, (x) => x.tax)), cogs: r2(sum(lines, (x) => x.cogs)),
    restock: i.restock, mode: i.mode, payout, reason: i.reason, by: byUser(d),
  }
  s.refunds.push(ref)
  s.refundedAmount = r2(s.refundedAmount + amount)
  if (payout > 0 && i.mode !== 'Adjust') addPayment(d, { mode: i.mode, type: 'refund', amount: payout, saleId: id, customerId: s.customerId, note: 'Refund: ' + i.reason })
  return ref
}

export function opReceiveDue(d: State, i: { customerId: string; amount: number; mode: PayMode; ref?: string; provider?: string }) {
  if (!(i.amount > 0)) throw new Error('Enter an amount greater than 0')
  const dues = d.sales
    .filter((s) => s.customerId === i.customerId)
    .map((s) => ({ s, due: saleDueOf(d, s) }))
    .filter((x) => x.due > 0.5)
    .sort((a, b) => a.s.at.localeCompare(b.s.at))
  const total = r2(sum(dues, (x) => x.due))
  if (i.amount > total + 0.5) throw new Error(`Amount exceeds outstanding balance of ₹${total}`)
  let rem = r2(i.amount)
  const ref = i.ref || (i.mode === 'UPI' ? upiRef() : undefined)
  for (const x of dues) {
    if (rem <= 0) break
    const t = Math.min(rem, x.due)
    addPayment(d, { mode: i.mode, type: 'receipt', amount: t, ref, provider: i.provider, saleId: x.s.id, orderId: x.s.orderId, customerId: i.customerId, note: 'Dues received' })
    rem = r2(rem - t)
  }
}

/* ---------------- customers ---------------- */
export function opSaveCustomer(d: State, c: Partial<Customer> & { name: string; mobile: string }): Customer {
  if (!c.name.trim()) throw new Error('Customer name is required')
  if (!/^[6-9]\d{9}$/.test(c.mobile.replace(/\s|\+91|-/g, '').slice(-10))) throw new Error('Enter a valid 10-digit Indian mobile number')
  const mobile = c.mobile.replace(/\s|-/g, '').replace(/^\+91/, '').slice(-10)
  if (d.customers.some((x) => x.id !== c.id && x.mobile === mobile)) throw new Error('A customer with this mobile number already exists')
  if (c.id) {
    const x = d.customers.find((y) => y.id === c.id)!
    Object.assign(x, c, { mobile })
    return x
  }
  const n: Customer = { id: uid('cus'), type: 'Regular', state: d.settings.state, address: '', creditLimit: 5000, createdAt: TODAY(), ...c, mobile }
  d.customers.push(n)
  return n
}
export function opDeleteCustomer(d: State, id: string) {
  if (d.sales.some((s) => s.customerId === id) || d.orders.some((o) => o.customerId === id)) throw new Error('Customer has transactions and cannot be deleted')
  d.customers = d.customers.filter((c) => c.id !== id)
}

/* ---------------- orders ---------------- */
export interface OrderInput {
  customerId: string
  source: Order['source']
  kind: Order['kind']
  items: { productId: string; qty: number; rate?: number }[]
  discount?: number
  dueDate: string
  dueTime?: string
  delivery: 'Pickup' | 'Delivery'
  deliveryAddress?: string
  notes?: string
  packaging?: string
  festivalId?: string
  paymentTerms?: Order['paymentTerms']
  advance?: { amount: number; mode: PayMode; ref?: string; full?: boolean }
  acceptance?: Order['acceptance']
  platformRef?: string
  at?: string
}
function orderItems(d: State, items: OrderInput['items']): OrderItem[] {
  if (!items.length) throw new Error('Add at least one item')
  return items.map((it) => {
    const p = d.products.find((x) => x.id === it.productId)
    if (!p) throw new Error('Product not found')
    if (!(it.qty > 0)) throw new Error(`Invalid quantity for ${p.name}`)
    return { productId: p.id, name: p.name, unit: p.unit, qty: r3(it.qty), rate: it.rate ?? p.sellPrice, gstRate: p.gstRate, hsn: p.hsn }
  })
}
const billOf = (d: State, items: OrderItem[], discount: number, supply: 'intra' | 'inter') =>
  computeBill(items.map((i) => ({ ...i })), discount, supply, d.settings.pricesIncludeGst)

export function opCreateOrder(d: State, i: OrderInput): Order {
  const cust = d.customers.find((c) => c.id === i.customerId)
  if (!cust) throw new Error('Select a customer')
  if (!i.dueDate) throw new Error('Delivery / pickup date is required')
  if (i.delivery === 'Delivery' && !(i.deliveryAddress || cust.address)) throw new Error('Delivery address is required')
  const items = orderItems(d, i.items)
  const supply = supplyFor(d.settings.state, cust.state)
  const bill = billOf(d, items, i.discount || 0, supply)
  const adv = i.advance && (i.advance.full || i.advance.amount > 0) ? { ...i.advance, amount: i.advance.full ? bill.total : i.advance.amount } : undefined
  if (adv && adv.amount > bill.total + 0.5) throw new Error('Advance cannot exceed the order total')
  const at = i.at ?? NOW()
  const o: Order = {
    id: uid('ord'), orderNo: `ORD-${pad(++d.counters.order, 4)}`, at, source: i.source, kind: i.kind, customerId: cust.id, customerName: cust.name, items,
    discount: bill.discount, subtotal: bill.subtotal, total: bill.total, supply, status: 'Received', acceptance: i.acceptance ?? (i.source === 'Walk-in' ? 'NA' : 'Accepted'),
    dueDate: i.dueDate, dueTime: i.dueTime, delivery: i.delivery, deliveryAddress: i.deliveryAddress || cust.address, notes: i.notes, packaging: i.packaging,
    festivalId: i.festivalId, paymentTerms: i.paymentTerms ?? (adv ? 'Advance' : 'COD'), stockDeducted: false, allocs: [], platformRef: i.platformRef,
    history: [{ at, status: 'Received', by: byUser(d), note: `Order recorded via ${i.source}` }],
  }
  d.orders.push(o)
  if (adv) addPayment(d, { mode: adv.mode, type: 'receipt', amount: adv.amount, ref: adv.ref, orderId: o.id, customerId: cust.id, note: 'Advance payment', at })
  return o
}

export function opUpdateOrder(d: State, id: string, patch: Partial<OrderInput>) {
  const o = d.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  if (o.status === 'Delivered' || o.status === 'Cancelled') throw new Error(`A ${o.status.toLowerCase()} order cannot be edited`)
  const itemsChanged = patch.items !== undefined || patch.discount !== undefined
  if (itemsChanged && o.stockDeducted) throw new Error('Items are locked once preparation has started (stock already allocated). Cancel the order to change items.')
  if (patch.items || patch.discount !== undefined) {
    const items = patch.items ? orderItems(d, patch.items) : o.items
    const bill = billOf(d, items, patch.discount ?? o.discount, o.supply)
    const paid = paidFor(d, 'orderId', o.id)
    if (bill.total + 0.5 < paid) throw new Error(`New total (₹${bill.total}) is lower than the ₹${paid} already paid. Refund first.`)
    o.items = items; o.discount = bill.discount; o.subtotal = bill.subtotal; o.total = bill.total
  }
  for (const k of ['dueDate', 'dueTime', 'delivery', 'deliveryAddress', 'notes', 'packaging', 'kind', 'festivalId'] as const) if (patch[k] !== undefined) (o as any)[k] = patch[k]
  o.history.push({ at: NOW(), status: o.status, by: byUser(d), note: 'Order edited' })
}

export const orderFlow = (o: Pick<Order, 'delivery'>): OrderStatus[] => ['Received', 'Confirmed', 'Preparing', 'Ready', ...(o.delivery === 'Delivery' ? (['Dispatched'] as OrderStatus[]) : []), 'Delivered']

export function opAdvanceOrder(d: State, id: string, opts?: { collect?: { mode: PayMode; amount: number; ref?: string }; allowCredit?: boolean }) {
  const o = d.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  if (o.status === 'Cancelled' || o.status === 'Delivered') throw new Error(`Order is already ${o.status.toLowerCase()}`)
  if (o.acceptance === 'Pending') throw new Error('Accept the order first')
  const flow = orderFlow(o)
  const next = flow[flow.indexOf(o.status) + 1]
  if (!next) throw new Error('No further status')
  const at = NOW()
  if (next === 'Preparing' && !o.stockDeducted) {
    const allocs: Alloc[][] = []
    for (const it of o.items) {
      const a = allocateFEFO(d, it.productId, it.qty, it.name)
      applyOut(d, a, it.productId, 'order-reserve', o.orderNo)
      allocs.push(a)
    }
    o.allocs = allocs
    o.stockDeducted = true
  }
  if (next === 'Delivered') {
    if (!o.stockDeducted) throw new Error('Stock has not been allocated for this order')
    const cust = d.customers.find((c) => c.id === o.customerId)
    const bill = billOf(d, o.items, o.discount, o.supply)
    bill.lines.forEach((l, k) => { l.allocs = o.allocs[k].map((a) => ({ ...a, returned: 0 })); l.cogs = r2(sumAllocCost(l.allocs)) })
    const paid = paidFor(d, 'orderId', o.id)
    const collect = opts?.collect && opts.collect.amount > 0 ? opts.collect : undefined
    const remaining = r2(bill.total - paid - (collect?.amount || 0))
    if (collect && collect.amount > bill.total - paid + 0.5) throw new Error('Collected amount exceeds balance due')
    if (remaining > 0.5 && !opts?.allowCredit) throw new Error(`Balance of ₹${r2(bill.total - paid)} is due — collect it or choose “keep as customer credit”.`)
    const invoiceNo = `SMB/${fyLabel(at.slice(0, 10))}/${pad(++d.counters.invoice, 5)}`
    const sale: Sale = {
      id: uid('sale'), invoiceNo, at, date: at.slice(0, 10), customerId: cust?.id, customerName: o.customerName, customerMobile: cust?.mobile, customerGstin: cust?.gstin,
      customerState: cust?.state, supply: o.supply, lines: bill.lines, subtotal: bill.subtotal, discount: bill.discount, taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst,
      igst: bill.igst, roundOff: bill.roundOff, total: bill.total, status: 'Completed', source: 'Order', orderId: o.id, cashier: byUser(d), refunds: [], refundedAmount: 0, note: `Order ${o.orderNo}`,
    }
    d.sales.push(sale)
    for (const p of d.payments) if (p.orderId === o.id) p.saleId = sale.id
    if (collect) addPayment(d, { ...collect, type: 'receipt', orderId: o.id, saleId: sale.id, customerId: o.customerId, note: 'Balance payment on delivery', at })
    o.saleId = sale.id
  }
  o.status = next
  o.history.push({ at, status: next, by: byUser(d) })
}

export function opCancelOrder(d: State, id: string, i: { reason: string; refundMode?: PayMode }) {
  const o = d.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  if (o.status === 'Delivered') throw new Error('Delivered orders cannot be cancelled — raise a refund on the invoice instead')
  if (o.status === 'Cancelled') throw new Error('Order already cancelled')
  if (!i.reason.trim()) throw new Error('Cancellation reason is required')
  if (o.stockDeducted) {
    o.items.forEach((it, k) => restoreAllocs(d, it.productId, o.allocs[k], it.qty, 'order-release', o.orderNo))
    o.stockDeducted = false
    o.allocs = []
  }
  const paid = paidFor(d, 'orderId', o.id)
  if (paid > 0.5 && i.refundMode) addPayment(d, { mode: i.refundMode, type: 'refund', amount: paid, orderId: o.id, customerId: o.customerId, note: 'Order cancelled: advance refunded' })
  o.status = 'Cancelled'
  o.cancelReason = i.reason
  o.history.push({ at: NOW(), status: 'Cancelled', by: byUser(d), note: i.reason + (paid > 0.5 ? (i.refundMode ? ` · ₹${paid} refunded via ${i.refundMode}` : ` · ₹${paid} advance retained`) : '') })
}

export function opOrderPayment(d: State, id: string, i: { amount: number; mode: PayMode; ref?: string; provider?: string }) {
  const o = d.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  if (o.status === 'Cancelled') throw new Error('Order is cancelled')
  if (!(i.amount > 0)) throw new Error('Enter an amount greater than 0')
  const due = r2(o.total - paidFor(d, 'orderId', o.id))
  if (i.amount > due + 0.5) throw new Error(`Amount exceeds balance due (₹${due})`)
  addPayment(d, { ...i, type: 'receipt', orderId: o.id, saleId: o.saleId, customerId: o.customerId, note: o.status === 'Delivered' ? 'Balance payment' : 'Advance / part payment' })
}

export function opDecideOrder(d: State, id: string, accept: boolean, reason?: string) {
  const o = d.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  if (o.acceptance !== 'Pending') throw new Error('Order already decided')
  if (accept) {
    o.acceptance = 'Accepted'
    o.status = 'Confirmed'
    o.history.push({ at: NOW(), status: 'Confirmed', by: byUser(d), note: 'Order accepted' })
  } else {
    o.acceptance = 'Rejected'
    opCancelOrder(d, id, { reason: reason || 'Rejected by shop', refundMode: paidFor(d, 'orderId', id) > 0.5 ? 'UPI' : undefined })
  }
}

/* ---------------- purchasing ---------------- */
export function opCreatePO(d: State, i: { supplierId: string; date: string; expected: string; items: POItem[]; notes?: string }): PurchaseOrder {
  if (!d.suppliers.some((s) => s.id === i.supplierId)) throw new Error('Select a supplier')
  const items = i.items.filter((x) => x.qty > 0)
  if (!items.length) throw new Error('Add at least one item with quantity')
  if (items.some((x) => x.rate < 0 || !x.name)) throw new Error('Each line needs a name and a valid rate')
  const po: PurchaseOrder = { id: uid('po'), poNo: `PO-${pad(++d.counters.po, 4)}`, supplierId: i.supplierId, date: i.date, expected: i.expected, items, status: 'Ordered', notes: i.notes }
  d.pos.push(po)
  return po
}

export function opReceivePO(d: State, poId: string, i: { date: string; invNo: string; lines: { idx: number; qty: number; batchNo?: string; produced?: string; expiry?: string }[]; paidNow?: { amount: number; mode: PayMode | 'Bank'; ref?: string } }): PurchaseInvoice {
  const po = d.pos.find((x) => x.id === poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'Ordered') throw new Error(`PO is already ${po.status.toLowerCase()} — goods cannot be received twice`)
  const sup = d.suppliers.find((s) => s.id === po.supplierId)!
  const supply = supplyFor(d.settings.state, sup.state)
  const grnNo = `GRN-${pad(++d.counters.grn, 4)}`
  const lines: PurchaseInvoice['lines'] = []
  for (const l of i.lines) {
    if (!(l.qty > 0)) continue
    const it = po.items[l.idx]
    const taxable = r2(l.qty * it.rate)
    const tax = r2((taxable * it.gstRate) / 100)
    const prod = it.productId ? d.products.find((p) => p.id === it.productId) : undefined
    let batchNo: string | undefined
    let expiry: string | undefined
    if (prod) {
      const b = addBatch(d, prod, { qty: l.qty, cost: it.rate, batchNo: l.batchNo, produced: l.produced || i.date, expiry: l.expiry, received: i.date, type: 'purchase', ref: grnNo, supplierId: po.supplierId })
      batchNo = b.batchNo
      expiry = b.expiry
      prod.purchasePrice = it.rate // latest purchase cost becomes the standard cost
    } else {
      d.expenses.push({ id: uid('exp'), date: i.date, category: it.expenseCat || 'Packaging', amount: taxable, mode: 'Bank', note: `${it.name} (${po.poNo}, non-stock purchase)`, by: byUser(d), auto: true })
    }
    lines.push({ productId: it.productId, name: it.name, unit: it.unit, qty: l.qty, rate: it.rate, gstRate: it.gstRate, taxable, tax, batchNo, expiry })
  }
  if (!lines.length) throw new Error('Enter received quantity for at least one line')
  const taxable = r2(sum(lines, (x) => x.taxable))
  const tax = r2(sum(lines, (x) => x.tax))
  const inv: PurchaseInvoice = {
    id: uid('pinv'), invNo: i.invNo || `INV-${grnNo}`, grnNo, poId, supplierId: po.supplierId, date: i.date, dueDate: addDays(i.date, sup.terms), lines, taxable,
    cgst: supply === 'intra' ? r2(tax / 2) : 0, sgst: supply === 'intra' ? r2(tax - r2(tax / 2)) : 0, igst: supply === 'inter' ? tax : 0, total: r2(taxable + tax),
  }
  d.purchaseInvoices.push(inv)
  po.status = 'Received'
  po.invoiceId = inv.id
  if (i.paidNow && i.paidNow.amount > 0) opPaySupplier(d, { supplierId: po.supplierId, invoiceId: inv.id, amount: Math.min(i.paidNow.amount, inv.total), mode: i.paidNow.mode, ref: i.paidNow.ref, date: i.date })
  return inv
}

export function opPaySupplier(d: State, i: { supplierId: string; invoiceId?: string; amount: number; mode: PayMode | 'Bank'; ref?: string; date: string }) {
  if (!(i.amount > 0)) throw new Error('Enter an amount greater than 0')
  const paidBy = new Map<string, number>()
  for (const p of d.supplierPayments) for (const a of p.allocations) paidBy.set(a.invoiceId, (paidBy.get(a.invoiceId) || 0) + a.amount)
  const open = d.purchaseInvoices
    .filter((x) => x.supplierId === i.supplierId && (!i.invoiceId || x.id === i.invoiceId))
    .map((x) => ({ x, due: r2(x.total - (paidBy.get(x.id) || 0)) }))
    .filter((x) => x.due > 0.005)
    .sort((a, b) => a.x.dueDate.localeCompare(b.x.dueDate))
  const total = r2(sum(open, (o) => o.due))
  if (!open.length) throw new Error('No outstanding invoices for this supplier')
  if (i.amount > total + 0.005) throw new Error(`Amount exceeds outstanding balance of ₹${total}`)
  let rem = r2(i.amount)
  const allocations: { invoiceId: string; amount: number }[] = []
  for (const o of open) {
    if (rem <= 0.004) break
    const t = Math.min(rem, o.due)
    allocations.push({ invoiceId: o.x.id, amount: r2(t) })
    rem = r2(rem - t)
  }
  d.supplierPayments.push({ id: uid('spay'), date: i.date, supplierId: i.supplierId, amount: r2(i.amount), mode: i.mode, ref: i.ref || (i.mode === 'UPI' ? upiRef() : undefined), allocations, by: byUser(d) })
}

export function opSaveSupplier(d: State, s: Partial<Supplier> & { name: string }) {
  if (!s.name.trim()) throw new Error('Supplier name is required')
  if (s.gstin && !/^\d{2}[A-Z0-9]{10}\d[A-Z0-9]{2}$/i.test(s.gstin)) throw new Error('GSTIN format looks invalid (15 characters expected)')
  if (s.id) Object.assign(d.suppliers.find((x) => x.id === s.id)!, s)
  else d.suppliers.push({ id: uid('sup'), contact: '', phone: '', address: '', state: d.settings.state, gstin: '', terms: 15, supplies: '', ...s })
}

/* ---------------- expenses / staff / festivals ---------------- */
export function opAddExpense(d: State, e: Omit<Expense, 'id'>) {
  if (!(e.amount > 0)) throw new Error('Amount must be greater than 0')
  if (!e.date) throw new Error('Date is required')
  d.expenses.push({ ...e, id: uid('exp'), by: byUser(d) })
}
export function opDeleteExpense(d: State, id: string) {
  const e = d.expenses.find((x) => x.id === id)
  if (e?.auto) throw new Error('Auto-generated purchase expenses cannot be deleted here')
  d.expenses = d.expenses.filter((x) => x.id !== id)
}
export function opSaveStaff(d: State, s: Partial<Staff> & { name: string }) {
  if (!s.name.trim()) throw new Error('Name is required')
  if ((s.monthlySalary ?? 1) < 0) throw new Error('Invalid salary')
  if (s.id) Object.assign(d.staff.find((x) => x.id === s.id)!, s)
  else d.staff.push({ id: uid('stf'), role: 'Sales Executive', phone: '', joined: TODAY(), monthlySalary: 15000, active: true, ...s })
}
export function opMarkAttendance(d: State, i: { staffId: string; date: string; status: AttStatus; checkIn?: string; checkOut?: string }) {
  let a = d.attendance.find((x) => x.staffId === i.staffId && x.date === i.date)
  if (!a) { a = { id: uid('att'), staffId: i.staffId, date: i.date, status: i.status }; d.attendance.push(a) }
  a.status = i.status
  if (i.status === 'Absent' || i.status === 'Leave') { a.checkIn = undefined; a.checkOut = undefined }
  else {
    a.checkIn = i.checkIn !== undefined ? i.checkIn : a.checkIn || d.settings.openTime
    if (i.checkOut !== undefined) a.checkOut = i.checkOut || undefined
  }
}
export function opSaveFestival(d: State, f: Partial<Festival> & { name: string }) {
  if (!f.name.trim() || !f.date) throw new Error('Festival name and date are required')
  if (f.id) Object.assign(d.festivals.find((x) => x.id === f.id)!, f)
  else d.festivals.push({ id: uid('fes'), active: true, ...f } as Festival)
}

/* ---------------- shop operations ---------------- */
export function opOpenShop(d: State, i: { date?: string; time: string; openingCash: number; notes?: string; checklist: Record<string, boolean> }) {
  const date = i.date || TODAY()
  if (!(i.openingCash >= 0)) throw new Error('Enter a valid opening cash balance')
  let rec = d.days.find((x) => x.date === date)
  if (rec?.openedAt && !rec.closedAt) throw new Error('Shop is already open for today')
  if (rec?.closedAt) throw new Error('Today is already closed. Use “Reopen shop” first.')
  if (!rec) { rec = { date, openingCash: 0, checklist: {} }; d.days.push(rec) }
  Object.assign(rec, { openedAt: date + 'T' + i.time, openedBy: byUser(d), openingCash: r2(i.openingCash), openNotes: i.notes, checklist: i.checklist })
}
export function opCloseShop(d: State, i: { date?: string; time: string; actualCash: number; notes?: string }) {
  const date = i.date || TODAY()
  const rec = d.days.find((x) => x.date === date)
  if (!rec?.openedAt) throw new Error('Shop was not opened today — open it first')
  if (rec.closedAt) throw new Error('Already closed')
  if (!(i.actualCash >= 0)) throw new Error('Enter the counted cash balance')
  clearMemo(d)
  const reg = cashRegister(d, date)
  const s = periodSummary(d, date, date)
  rec.closedAt = date + 'T' + i.time
  rec.closedBy = byUser(d)
  rec.expectedCash = reg.expected
  rec.actualCash = r2(i.actualCash)
  rec.diff = r2(i.actualCash - reg.expected)
  rec.closeNotes = i.notes
  rec.summary = { sales: r2(s.billed), cash: r2(s.cash), upi: r2(s.upi), card: r2(s.card), refunds: r2(s.refundsBilled), discounts: r2(s.discountsBilled), wastage: r2(s.wastage), bills: s.bills, grossProfit: r2(s.grossProfit), netProfit: r2(s.netProfit) }
}
export function opReopenShop(d: State) {
  const rec = d.days.find((x) => x.date === TODAY())
  if (!rec?.closedAt) throw new Error('Shop is not closed')
  rec.closedAt = undefined; rec.closedBy = undefined; rec.expectedCash = undefined; rec.actualCash = undefined; rec.diff = undefined; rec.summary = undefined; rec.closeNotes = undefined
}

export { dayDiff }

export function opCancelPO(d: State, id: string) {
  const po = d.pos.find((x) => x.id === id)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'Ordered') throw new Error('Only open purchase orders can be cancelled')
  po.status = 'Cancelled'
}
