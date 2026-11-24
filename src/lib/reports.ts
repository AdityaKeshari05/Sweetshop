import type { Role, Sale, State } from './types'
import { batchStatus, customerOutstanding, orderDue, orderPaid, periodSummary, stockMap, supplierBalances } from './calc'
import { datesBetween, dayDiff, fmtDate, fmtTime, r2, sum, todayStr, num } from './util'

export interface Report { title: string; headers: string[]; rows: (string | number)[][]; money?: number[]; note?: string }
export interface ReportDef { id: string; label: string; group: string; roles?: Role[] }

export const REPORTS: ReportDef[] = [
  { id: 'daily-sales', label: 'Daily sales report', group: 'Sales' },
  { id: 'product-sales', label: 'Product-wise sales report', group: 'Sales' },
  { id: 'payments', label: 'Payment report', group: 'Sales' },
  { id: 'customers', label: 'Customer report', group: 'Sales' },
  { id: 'festival', label: 'Festival orders report', group: 'Sales' },
  { id: 'inventory', label: 'Inventory report', group: 'Stock' },
  { id: 'stock-movement', label: 'Stock movement report', group: 'Stock' },
  { id: 'expiry', label: 'Expiry report', group: 'Stock' },
  { id: 'wastage', label: 'Wastage report', group: 'Stock' },
  { id: 'purchases', label: 'Purchase report', group: 'Purchasing' },
  { id: 'suppliers', label: 'Supplier report', group: 'Purchasing' },
  { id: 'attendance', label: 'Staff attendance report', group: 'People' },
  { id: 'gst-sales-register', label: 'GST — Sales register', group: 'Tax (demo)' },
  { id: 'gst-purchase-register', label: 'GST — Purchase register', group: 'Tax (demo)' },
  { id: 'gst-output', label: 'GST — Output tax summary', group: 'Tax (demo)' },
  { id: 'gst-input', label: 'GST — Input tax summary', group: 'Tax (demo)' },
  { id: 'gst-cgst', label: 'GST — CGST summary', group: 'Tax (demo)' },
  { id: 'gst-sgst', label: 'GST — SGST summary', group: 'Tax (demo)' },
  { id: 'gst-igst', label: 'GST — IGST summary', group: 'Tax (demo)' },
  { id: 'pnl', label: 'Daily profit & loss', group: 'Finance', roles: ['Owner'] },
]

const DEMO = 'Demonstration calculation only — not a filed GST return or certified tax compliance document.'

/** net-of-refund tax split for a sale */
export function saleNetTax(x: Sale) {
  const rTax = sum(x.refunds, (r) => r.tax)
  const rTaxable = sum(x.refunds, (r) => r.taxable)
  const tax = x.cgst + x.sgst + x.igst
  const netTax = r2(tax - rTax)
  const k = tax ? netTax / tax : 0
  return { taxable: r2(x.taxable - rTaxable), cgst: r2(x.cgst * k), sgst: r2(x.sgst * k), igst: r2(x.igst * k), total: r2(x.total - x.refundedAmount) }
}

/** output / input tax by GST rate */
export function taxByRate(s: State, from: string, to: string) {
  const out = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>()
  const inn = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>()
  const add = (m: typeof out, rate: number, taxable: number, tax: number, inter: boolean) => {
    const e = m.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    e.taxable += taxable
    if (inter) e.igst += tax
    else { e.cgst += tax / 2; e.sgst += tax / 2 }
    m.set(rate, e)
  }
  for (const x of s.sales) {
    if (x.status === 'Cancelled' || x.date < from || x.date > to) continue
    for (const l of x.lines) {
      const f = (l.qty - l.refundedQty) / l.qty
      add(out, l.gstRate, l.taxable * f, l.tax * f, x.supply === 'inter')
    }
  }
  for (const i of s.purchaseInvoices) {
    if (i.date < from || i.date > to) continue
    const inter = i.igst > 0
    for (const l of i.lines) add(inn, l.gstRate, l.taxable, l.tax, inter)
  }
  return { out, inn }
}

export function buildReport(id: string, s: State, from: string, to: string): Report {
  const today = todayStr()
  const pname = (pid: string) => s.products.find((p) => p.id === pid)?.name || '—'
  const days = datesBetween(from, to)
  const sales = s.sales.filter((x) => x.status === 'Completed' && x.date >= from && x.date <= to)
  switch (id) {
    case 'daily-sales':
      return {
        title: 'Daily sales report', money: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        headers: ['Date', 'Bills', 'Gross sales (ex-GST)', 'Discounts (ex-GST)', 'Refunds (ex-GST)', 'Net sales (ex-GST)', 'GST collected', 'Billed total (incl. GST)', 'Cash', 'UPI', 'Card'],
        rows: days.map((d) => { const m = periodSummary(s, d, d); return [fmtDate(d), m.bills, r2(m.grossSales), r2(m.discounts), r2(m.refunds), r2(m.netSales), r2(m.outputTax), r2(m.billed), r2(m.cash), r2(m.upi), r2(m.card)] }),
      }
    case 'product-sales': {
      const m = new Map<string, { name: string; cat: string; unit: string; qty: number; rev: number; cogs: number }>()
      for (const x of sales) for (const l of x.lines) {
        const f = (l.qty - l.refundedQty) / l.qty
        const e = m.get(l.productId) || { name: l.name, cat: s.products.find((p) => p.id === l.productId)?.category || '', unit: l.unit, qty: 0, rev: 0, cogs: 0 }
        e.qty += l.qty - l.refundedQty; e.rev += l.taxable * f; e.cogs += l.cogs * f
        m.set(l.productId, e)
      }
      return { title: 'Product-wise sales report', money: [4, 5, 6], headers: ['Product', 'Category', 'Qty sold', 'Unit', 'Net sales (ex-GST)', 'Cost of goods sold', 'Gross profit', 'Margin %'], rows: [...m.values()].sort((a, b) => b.rev - a.rev).map((e) => [e.name, e.cat, num(e.qty, 3) as any, e.unit, r2(e.rev), r2(e.cogs), r2(e.rev - e.cogs), e.rev ? r2(((e.rev - e.cogs) / e.rev) * 100) : 0]) }
    }
    case 'payments':
      return {
        title: 'Payment report', money: [4], headers: ['Date', 'Time', 'Type', 'Mode', 'Amount', 'Reference', 'Provider', 'Invoice / order', 'Customer', 'Status'],
        rows: s.payments.filter((p) => p.date >= from && p.date <= to).sort((a, b) => a.at.localeCompare(b.at)).map((p) => [fmtDate(p.date), fmtTime(p.at), p.type, p.mode, p.type === 'refund' ? -p.amount : p.amount, p.ref || '', p.provider || '', [s.sales.find((x) => x.id === p.saleId)?.invoiceNo, s.orders.find((o) => o.id === p.orderId)?.orderNo].filter(Boolean).join(' / '), s.customers.find((c) => c.id === p.customerId)?.name || 'Walk-in', p.status]),
      }
    case 'customers':
      return { title: 'Customer report', money: [4, 5], headers: ['Customer', 'Mobile', 'Type', 'Invoices (period)', 'Sales (period)', 'Outstanding (now)'], rows: s.customers.map((c) => { const cs = sales.filter((x) => x.customerId === c.id); return [c.name, c.mobile, c.type, cs.length, r2(sum(cs, (x) => x.total - x.refundedAmount)), r2(customerOutstanding(s, c))] }) }
    case 'festival':
      return { title: 'Festival orders report', money: [5, 6, 7], headers: ['Festival', 'Order', 'Customer', 'Items', 'Status', 'Total', 'Paid', 'Balance', 'Due date'], rows: s.orders.filter((o) => o.festivalId && o.dueDate >= from && o.dueDate <= to).map((o) => [s.festivals.find((f) => f.id === o.festivalId)?.name || '', o.orderNo, o.customerName, o.items.map((i) => `${i.name} ×${i.qty}`).join('; '), o.status, o.total, orderPaid(s, o), orderDue(s, o), fmtDate(o.dueDate)]), note: 'Filtered by delivery date.' }
    case 'inventory': {
      const sm = stockMap(s)
      return { title: 'Inventory report (as of today)', money: [7, 8, 9], headers: ['Product', 'SKU', 'Category', 'Unit', 'Available', 'Expired qty', 'Min stock', 'Purchase price', 'Selling price', 'Stock value (cost)', 'Status'], rows: s.products.filter((p) => !p.archived).map((p) => [p.name, p.sku, p.category, p.unit, sm[p.id].sellable, sm[p.id].expired, p.minStock, p.purchasePrice, p.sellPrice, r2(sm[p.id].value + sm[p.id].expiredValue), sm[p.id].status]) }
    }
    case 'stock-movement':
      return { title: 'Stock movement report', headers: ['Date', 'Time', 'Product', 'Batch', 'Movement', 'Qty', 'Reference', 'Note', 'Location', 'By'], rows: s.ledger.filter((l) => l.at.slice(0, 10) >= from && l.at.slice(0, 10) <= to).sort((a, b) => a.at.localeCompare(b.at)).map((l) => [fmtDate(l.at.slice(0, 10)), fmtTime(l.at), pname(l.productId), l.batchNo || '', l.type, l.qty, l.ref || '', l.note || '', s.locations.find((x) => x.id === l.locationId)?.name || '', l.by || '']) }
    case 'expiry':
      return { title: 'Expiry report (current batches)', money: [6], headers: ['Product', 'Batch', 'Produced', 'Expiry', 'Days left', 'Qty', 'Value at cost', 'Status'], rows: s.batches.filter((b) => b.qty > 0.0004 && b.locationId === 'main').sort((a, b) => a.expiry.localeCompare(b.expiry)).map((b) => [pname(b.productId), b.batchNo, fmtDate(b.produced), fmtDate(b.expiry), dayDiff(today, b.expiry), b.qty, r2(b.qty * b.cost), batchStatus(b, today, s.products.find((p) => p.id === b.productId)?.shelfLife)]) }
    case 'wastage':
      return { title: 'Wastage report', money: [5], headers: ['Date', 'Product', 'Batch', 'Qty', 'Reason', 'Cost', 'Recorded by', 'Notes'], rows: s.wastage.filter((w) => w.date >= from && w.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map((w) => [fmtDate(w.date), pname(w.productId), w.batchNo, w.qty, w.reason, w.cost, w.by, w.note || '']) }
    case 'purchases':
      return { title: 'Purchase report', money: [5, 6, 7], headers: ['Date', 'GRN', 'Invoice', 'Supplier', 'Items', 'Taxable', 'GST', 'Total'], rows: s.purchaseInvoices.filter((i) => i.date >= from && i.date <= to).map((i) => [fmtDate(i.date), i.grnNo, i.invNo, s.suppliers.find((x) => x.id === i.supplierId)?.name || '', i.lines.map((l) => l.name).join('; '), i.taxable, r2(i.cgst + i.sgst + i.igst), i.total]) }
    case 'suppliers': {
      const sb = supplierBalances(s)
      return { title: 'Supplier report', money: [3, 4, 5], headers: ['Supplier', 'GSTIN', 'Terms (days)', 'Invoiced (period)', 'Paid (period)', 'Outstanding (now)'], rows: s.suppliers.map((x) => [x.name, x.gstin, x.terms, r2(sum(s.purchaseInvoices.filter((i) => i.supplierId === x.id && i.date >= from && i.date <= to), (i) => i.total)), r2(sum(s.supplierPayments.filter((p) => p.supplierId === x.id && p.date >= from && p.date <= to), (p) => p.amount)), r2(sb.bySupplier.get(x.id)?.outstanding || 0)]) }
    }
    case 'attendance':
      return { title: 'Staff attendance report', headers: ['Staff', 'Role', 'Present', 'Half-day', 'Leave', 'Absent', 'Late arrivals', 'Days marked'], rows: s.staff.filter((x) => x.active).map((st) => { const a = s.attendance.filter((x) => x.staffId === st.id && x.date >= from && x.date <= to); const c = (k: string) => a.filter((x) => x.status === k).length; const late = a.filter((x) => x.checkIn && (x.status === 'Present' || x.status === 'Half-day') && +x.checkIn.slice(0, 2) * 60 + +x.checkIn.slice(3) > +s.settings.openTime.slice(0, 2) * 60 + +s.settings.openTime.slice(3) + s.settings.lateGraceMin).length; return [st.name, st.role, c('Present'), c('Half-day'), c('Leave'), c('Absent'), late, a.length] }) }
    case 'gst-sales-register':
      return { title: 'GST sales register', money: [6, 7, 8, 9, 10], note: DEMO, headers: ['Date', 'Invoice', 'Customer', 'Customer GSTIN', 'Place of supply', 'Supply', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice value'], rows: sales.map((x) => { const n = saleNetTax(x); return [fmtDate(x.date), x.invoiceNo, x.customerName, x.customerGstin || 'Unregistered', x.customerState || s.settings.state, x.supply === 'intra' ? 'Intra-state' : 'Inter-state', n.taxable, n.cgst, n.sgst, n.igst, n.total] }) }
    case 'gst-purchase-register':
      return { title: 'GST purchase register', money: [6, 7, 8, 9, 10], note: DEMO, headers: ['Date', 'Invoice', 'Supplier', 'Supplier GSTIN', 'State', 'Supply', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice value'], rows: s.purchaseInvoices.filter((i) => i.date >= from && i.date <= to).map((i) => { const sp = s.suppliers.find((x) => x.id === i.supplierId); return [fmtDate(i.date), i.invNo, sp?.name || '', sp?.gstin || '', sp?.state || '', i.igst > 0 ? 'Inter-state' : 'Intra-state', i.taxable, i.cgst, i.sgst, i.igst, i.total] }) }
    case 'gst-output': case 'gst-input': {
      const { out, inn } = taxByRate(s, from, to)
      const m = id === 'gst-output' ? out : inn
      const rows = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([rate, e]) => [`${rate}%`, r2(e.taxable), r2(e.cgst), r2(e.sgst), r2(e.igst), r2(e.cgst + e.sgst + e.igst)])
      if (rows.length) rows.push(['Total', ...[1, 2, 3, 4, 5].map((k) => r2(sum(rows as any[], (r) => r[k])))])
      return { title: id === 'gst-output' ? 'Output tax summary (on sales)' : 'Input tax summary (on purchases)', money: [1, 2, 3, 4, 5], note: DEMO, headers: ['GST rate', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total tax'], rows }
    }
    case 'gst-cgst': case 'gst-sgst': case 'gst-igst': {
      const k = id.slice(4) as 'cgst' | 'sgst' | 'igst'
      const { out, inn } = taxByRate(s, from, to)
      const o = sum([...out.values()], (e) => e[k]), i = sum([...inn.values()], (e) => e[k])
      return { title: `${k.toUpperCase()} summary`, money: [1, 2, 3], note: DEMO + ' Net payable = output tax − input tax credit, shown for illustration.', headers: ['Head', 'Output tax (sales)', 'Input tax credit (purchases)', 'Net payable / (credit)'], rows: [[k.toUpperCase(), r2(o), r2(i), r2(o - i)]] }
    }
    case 'pnl':
      return { title: 'Daily profit & loss', money: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], note: 'Net sales exclude GST. COGS = cost of inventory actually sold. Salaries and rent are daily allocations.', headers: ['Date', 'Net sales', 'COGS', 'Gross profit', 'Wastage', 'Salaries', 'Rent', 'Utilities', 'Packaging', 'Other', 'Net operating profit'], rows: days.map((d) => { const m = periodSummary(s, d, d); return [fmtDate(d), r2(m.netSales), r2(m.cogs), r2(m.grossProfit), r2(m.wastage), r2(m.salary), r2(m.rent), r2(m.utilities), r2(m.packaging), r2(m.otherExp), r2(m.netProfit)] }) }
  }
  return { title: 'Unknown', headers: [], rows: [] }
}
