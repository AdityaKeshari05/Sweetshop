import type { Alloc, Attendance, Batch, Customer, Order, Product, Sale, SaleLine, State, Supply } from './types'
import { addDays, daysInMonth, datesBetween, r2, r3, sum, timeToMin, todayStr } from './util'

/* ---------- tiny memo keyed by state identity ---------- */
const cache = new WeakMap<object, Map<string, any>>()
export const clearMemo = (s: State) => { cache.delete(s) }
export function memo<T>(s: State, key: string, fn: () => T): T {
  let m = cache.get(s)
  if (!m) cache.set(s, (m = new Map()))
  if (!m.has(key)) m.set(key, fn())
  return m.get(key)
}

/* ---------- GST bill computation ---------- */
export interface BillItem { productId: string; name: string; unit: any; hsn: string; gstRate: number; qty: number; rate: number }
export interface Bill {
  lines: SaleLine[]
  subtotal: number
  discount: number
  taxable: number
  tax: number
  cgst: number
  sgst: number
  igst: number
  roundOff: number
  total: number
}
export function computeBill(items: BillItem[], discount: number, supply: Supply, inclusive: boolean): Bill {
  const gross = items.map((i) => r2(i.qty * i.rate))
  const subtotal = r2(sum(gross, (x) => x))
  const disc = Math.min(Math.max(discount || 0, 0), subtotal)
  let allocated = 0
  const lines: SaleLine[] = items.map((it, i) => {
    const d = i === items.length - 1 ? r2(disc - allocated) : r2(subtotal ? (disc * gross[i]) / subtotal : 0)
    allocated = r2(allocated + d)
    const after = r2(gross[i] - d)
    const rt = it.gstRate / 100
    let taxable: number, tax: number, grossEx: number
    if (inclusive) {
      taxable = r2(after / (1 + rt))
      tax = r2(after - taxable)
      grossEx = r2(gross[i] / (1 + rt))
    } else {
      taxable = after
      tax = r2(taxable * rt)
      grossEx = gross[i]
    }
    return {
      productId: it.productId, name: it.name, unit: it.unit, hsn: it.hsn, gstRate: it.gstRate, qty: it.qty, rate: it.rate,
      gross: gross[i], discount: d, taxable, tax, total: r2(taxable + tax), grossEx, discEx: r2(grossEx - taxable),
      cogs: 0, allocs: [], refundedQty: 0,
    }
  })
  const taxable = r2(sum(lines, (l) => l.taxable))
  const tax = r2(sum(lines, (l) => l.tax))
  const raw = r2(taxable + tax)
  const total = Math.round(raw)
  const cgst = supply === 'intra' ? r2(tax / 2) : 0
  const sgst = supply === 'intra' ? r2(tax - cgst) : 0
  const igst = supply === 'inter' ? tax : 0
  return { lines, subtotal, discount: disc, taxable, tax, cgst, sgst, igst, roundOff: r2(total - raw), total }
}

export const supplyFor = (businessState: string, custState?: string): Supply => (!custState || custState === businessState ? 'intra' : 'inter')

/* ---------- stock ---------- */
export type StockStatus = 'In stock' | 'Low stock' | 'Out of stock' | 'Expiring soon' | 'Expired'
export interface StockInfo {
  sellable: number; expired: number; exp2: number; exp7: number; expToday: number; other: number
  value: number; expiredValue: number; status: StockStatus
}
export type BatchStatus = 'Empty' | 'Expired' | 'Expires today' | 'Expiring soon' | 'Within 7 days' | 'Fresh'
export function batchStatus(b: Batch, today = todayStr(), shelf = 30): BatchStatus {
  if (b.qty <= 0.0004) return 'Empty'
  if (b.expiry < today) return 'Expired'
  if (b.expiry === today) return 'Expires today'
  if (shelf > 2 && b.expiry <= addDays(today, 2)) return 'Expiring soon'
  if (b.expiry <= addDays(today, shelf <= 2 ? 1 : 7)) return 'Within 7 days'
  return 'Fresh'
}

export function stockMap(s: State): Record<string, StockInfo> {
  return memo(s, 'stockMap', () => {
    const today = todayStr()
    const m: Record<string, StockInfo> = {}
    const shelfOf = new Map(s.products.map((p) => [p.id, p.shelfLife]))
    for (const p of s.products) m[p.id] = { sellable: 0, expired: 0, exp2: 0, exp7: 0, expToday: 0, other: 0, value: 0, expiredValue: 0, status: 'Out of stock' }
    for (const b of s.batches) {
      const i = m[b.productId]
      if (!i || b.qty <= 0) continue
      if (b.locationId !== 'main') { i.other += b.qty; continue }
      if (b.expiry < today) { i.expired += b.qty; i.expiredValue += b.qty * b.cost; continue }
      i.sellable += b.qty
      i.value += b.qty * b.cost
      const sh = shelfOf.get(b.productId) ?? 30
      if (b.expiry === today) i.expToday += b.qty
      if (b.expiry <= addDays(today, sh <= 2 ? 0 : 2)) i.exp2 += b.qty
      if (b.expiry <= addDays(today, sh <= 2 ? 1 : 7)) i.exp7 += b.qty
    }
    for (const p of s.products) {
      const i = m[p.id]
      i.sellable = r3(i.sellable); i.expired = r3(i.expired)
      i.status = i.expired > 0 ? 'Expired' : i.sellable <= 0.0004 ? 'Out of stock' : i.sellable <= p.minStock ? 'Low stock' : i.exp2 > 0 ? 'Expiring soon' : 'In stock'
    }
    return m
  })
}

export const activeProducts = (s: State) => s.products.filter((p) => !p.archived)
export const lowStockProducts = (s: State) => {
  const m = stockMap(s)
  return activeProducts(s).filter((p) => m[p.id].sellable <= p.minStock)
}
export const stockValue = (s: State) => sum(Object.values(stockMap(s)), (i) => i.value + i.expiredValue)

/* ---------- payments, receivables ---------- */
export function paymentsBySale(s: State) {
  return memo(s, 'paySale', () => {
    const m = new Map<string, number>()
    for (const p of s.payments) {
      if (!p.saleId || p.status === 'Failed') continue
      m.set(p.saleId, (m.get(p.saleId) || 0) + (p.type === 'receipt' ? p.amount : -p.amount))
    }
    return m
  })
}
export function paymentsByOrder(s: State) {
  return memo(s, 'payOrder', () => {
    const m = new Map<string, number>()
    for (const p of s.payments) {
      if (!p.orderId || p.status === 'Failed') continue
      m.set(p.orderId, (m.get(p.orderId) || 0) + (p.type === 'receipt' ? p.amount : -p.amount))
    }
    return m
  })
}
export const orderPaid = (s: State, o: Order) => r2(paymentsByOrder(s).get(o.id) || 0)
export const orderDue = (s: State, o: Order) => (o.status === 'Cancelled' ? 0 : Math.max(0, r2(o.total - orderPaid(s, o))))
export const saleNet = (x: Sale) => r2(x.total - x.refundedAmount)
export function saleDue(s: State, x: Sale) {
  if (x.status === 'Cancelled') return 0
  return Math.max(0, r2(saleNet(x) - (paymentsBySale(s).get(x.id) || 0)))
}
export function receivables(s: State) {
  return memo(s, 'recv', () => {
    const byCustomer = new Map<string, number>()
    const dues: { sale: Sale; due: number }[] = []
    let total = 0
    for (const x of s.sales) {
      const d = saleDue(s, x)
      if (d > 0.5) {
        total += d
        dues.push({ sale: x, due: d })
        if (x.customerId) byCustomer.set(x.customerId, r2((byCustomer.get(x.customerId) || 0) + d))
      }
    }
    return { total: r2(total), byCustomer, dues }
  })
}
export const customerOutstanding = (s: State, c: Customer | string) => receivables(s).byCustomer.get(typeof c === 'string' ? c : c.id) || 0

/* ---------- suppliers ---------- */
export function supplierBalances(s: State) {
  return memo(s, 'supBal', () => {
    const paidByInv = new Map<string, number>()
    for (const p of s.supplierPayments) for (const a of p.allocations) paidByInv.set(a.invoiceId, (paidByInv.get(a.invoiceId) || 0) + a.amount)
    const bySupplier = new Map<string, { invoiced: number; paid: number; outstanding: number }>()
    const invDue = new Map<string, number>()
    for (const sp of s.suppliers) bySupplier.set(sp.id, { invoiced: 0, paid: 0, outstanding: 0 })
    for (const inv of s.purchaseInvoices) {
      const paid = paidByInv.get(inv.id) || 0
      const due = Math.max(0, r2(inv.total - paid))
      invDue.set(inv.id, due)
      const b = bySupplier.get(inv.supplierId)
      if (b) { b.invoiced += inv.total; b.paid += paid; b.outstanding += due }
    }
    return { bySupplier, invDue, paidByInv }
  })
}

/* ---------- period summary / P&L ---------- */
export interface Summary {
  from: string; to: string
  bills: number
  grossSales: number // ex GST, before discount
  discounts: number // ex GST
  refunds: number // ex GST
  netSales: number // ex GST
  outputTax: number
  billed: number // incl GST net of refunds
  discountsBilled: number
  refundsBilled: number
  cogs: number
  grossProfit: number
  wastage: number
  salary: number; rent: number; utilities: number; packaging: number; otherExp: number
  opex: number
  netProfit: number
  inputTax: number
  purchases: number
  cash: number; upi: number; card: number
  receipts: number
  expenseByCat: Record<string, number>
}
export function periodSummary(s: State, from: string, to: string): Summary {
  return memo(s, `sum:${from}:${to}`, () => {
    const out: Summary = {
      from, to, bills: 0, grossSales: 0, discounts: 0, refunds: 0, netSales: 0, outputTax: 0, billed: 0, discountsBilled: 0, refundsBilled: 0,
      cogs: 0, grossProfit: 0, wastage: 0, salary: 0, rent: 0, utilities: 0, packaging: 0, otherExp: 0, opex: 0, netProfit: 0, inputTax: 0, purchases: 0,
      cash: 0, upi: 0, card: 0, receipts: 0, expenseByCat: {},
    }
    for (const x of s.sales) {
      if (x.status === 'Cancelled') continue
      if (x.date >= from && x.date <= to) {
        out.bills++
        out.grossSales += sum(x.lines, (l) => l.grossEx)
        out.discounts += sum(x.lines, (l) => l.discEx)
        out.discountsBilled += x.discount
        out.billed += x.total
        out.outputTax += x.cgst + x.sgst + x.igst
        out.cogs += sum(x.lines, (l) => l.cogs)
      }
      for (const r of x.refunds) {
        if (r.date >= from && r.date <= to) {
          out.refunds += r.taxable
          out.refundsBilled += r.amount
          out.outputTax -= r.tax
          out.cogs -= r.cogs
        }
      }
    }
    // refunds recorded in range reduce billed total (billed counted at sale date gross of refunds)
    out.billed -= out.refundsBilled
    out.netSales = out.grossSales - out.discounts - out.refunds
    out.grossProfit = out.netSales - out.cogs
    out.wastage = sum(s.wastage.filter((w) => w.date >= from && w.date <= to), (w) => w.cost)
    const monthlySalary = sum(s.staff.filter((x) => x.active), (x) => x.monthlySalary)
    const capDay = todayStr()
    for (const d of datesBetween(from, to)) {
      if (d > capDay) break // fixed costs accrue only up to today
      const dim = daysInMonth(d)
      out.salary += monthlySalary / dim
      out.rent += s.settings.monthlyRent / dim
    }
    for (const e of s.expenses) {
      if (e.date < from || e.date > to) continue
      out.expenseByCat[e.category] = (out.expenseByCat[e.category] || 0) + e.amount
      if (e.category === 'Staff') out.salary += e.amount
      else if (e.category === 'Electricity' || e.category === 'Gas & Fuel') out.utilities += e.amount
      else if (e.category === 'Packaging') out.packaging += e.amount
      else out.otherExp += e.amount
    }
    out.opex = out.salary + out.rent + out.utilities + out.packaging + out.otherExp
    out.netProfit = out.grossProfit - out.wastage - out.opex
    for (const inv of s.purchaseInvoices) {
      if (inv.date >= from && inv.date <= to) { out.inputTax += inv.cgst + inv.sgst + inv.igst; out.purchases += inv.taxable }
    }
    for (const p of s.payments) {
      if (p.date < from || p.date > to || p.status === 'Failed') continue
      const v = p.type === 'receipt' ? p.amount : -p.amount
      if (p.mode === 'Cash') out.cash += v
      else if (p.mode === 'UPI') out.upi += v
      else out.card += v
      out.receipts += v
    }
    return out
  })
}

/* ---------- cash register ---------- */
export function cashRegister(s: State, date: string) {
  const day = s.days.find((d) => d.date === date)
  const entries: { at: string; label: string; amount: number }[] = []
  for (const p of s.payments) {
    if (p.date === date && p.mode === 'Cash' && p.status !== 'Failed')
      entries.push({ at: p.at, label: p.type === 'receipt' ? `Cash received ${p.saleId ? '(sale)' : p.orderId ? '(order)' : ''}` : 'Cash refund', amount: p.type === 'receipt' ? p.amount : -p.amount })
  }
  for (const e of s.expenses) if (e.date === date && e.mode === 'Cash') entries.push({ at: date + 'T12:00', label: `Expense — ${e.category}${e.note ? ': ' + e.note : ''}`, amount: -e.amount })
  for (const sp of s.supplierPayments) if (sp.date === date && sp.mode === 'Cash') entries.push({ at: date + 'T12:00', label: `Supplier payment — ${s.suppliers.find((x) => x.id === sp.supplierId)?.name}`, amount: -sp.amount })
  entries.sort((a, b) => a.at.localeCompare(b.at))
  const opening = day?.openingCash ?? 0
  const movement = sum(entries, (e) => e.amount)
  return { day, opening, entries, expected: r2(opening + movement), received: sum(entries.filter((e) => e.amount > 0), (e) => e.amount), paidOut: -sum(entries.filter((e) => e.amount < 0), (e) => e.amount) }
}

/* ---------- attendance ---------- */
export const isLate = (a: Attendance | undefined, openTime: string, grace: number) =>
  !!a && (a.status === 'Present' || a.status === 'Half-day') && !!a.checkIn && timeToMin(a.checkIn) > timeToMin(openTime) + grace

/* ---------- misc ---------- */
export const productById = (s: State, id: string): Product | undefined => s.products.find((p) => p.id === id)
export function sellableBatches(s: State, productId: string, today = todayStr()) {
  return s.batches
    .filter((b) => b.productId === productId && b.locationId === 'main' && b.qty > 0.0004 && b.expiry >= today)
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.received.localeCompare(b.received))
}
export const sumAllocCost = (a: Alloc[]) => sum(a, (x) => x.qty * x.cost)
