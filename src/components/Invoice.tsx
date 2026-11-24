import { Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Sale } from '../lib/types'
import { amountInWords, fmtDT, fmtQty, inr2, fmtDate } from '../lib/util'
import { saleDue } from '../lib/calc'
import { Modal, PrintArea } from './ui'

export function InvoiceView({ sale }: { sale: Sale }) {
  const s = useStore()
  const st = s.settings
  const pays = s.payments.filter((p) => p.saleId === sale.id && p.status !== 'Failed')
  const inter = sale.supply === 'inter'
  const due = saleDue(s, sale)
  const receipts = pays.filter((p) => p.type === 'receipt')
  return (
    <div className="bg-white text-stone-900 text-[12px] leading-snug p-6 border border-stone-200 rounded-lg print:border-0 print:p-0 max-w-[820px] mx-auto">
      <div className="flex justify-between gap-4 border-b-2 border-stone-800 pb-3">
        <div>
          <div className="text-lg font-bold tracking-tight">{st.businessName}</div>
          <div className="text-stone-600">{st.legalName}</div>
          <div className="text-stone-600 max-w-xs">{st.address}</div>
          <div className="text-stone-600">Ph: {st.phone}</div>
          <div className="mt-1"><b>GSTIN:</b> {st.gstin} &nbsp; <b>FSSAI:</b> {st.fssai}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold tracking-wide">{sale.status === 'Cancelled' ? 'CANCELLED INVOICE' : 'TAX INVOICE'}</div>
          <div className="mt-1"><b>Invoice No:</b> {sale.invoiceNo}</div>
          <div><b>Date:</b> {fmtDT(sale.at)}</div>
          <div><b>Place of supply:</b> {sale.customerState || st.state} ({inter ? 'Inter-state · IGST' : 'Intra-state · CGST+SGST'})</div>
          <div><b>Cashier:</b> {sale.cashier}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 py-3 border-b border-stone-300">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Billed to</div>
          <div className="font-semibold">{sale.customerName}</div>
          {sale.customerMobile && <div>Mobile: {sale.customerMobile}</div>}
          {sale.customerGstin && <div>GSTIN: {sale.customerGstin}</div>}
        </div>
        {sale.orderId && <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Reference</div><div>{sale.note}</div></div>}
      </div>
      <table className="w-full mt-3 border-collapse">
        <thead>
          <tr className="bg-stone-100 text-[10.5px] uppercase tracking-wide">
            {['#', 'Item', 'HSN', 'Qty', 'Rate', 'Disc.', 'Taxable', ...(inter ? ['IGST'] : ['CGST', 'SGST']), 'Amount'].map((h, i) => (
              <th key={h} className={`border border-stone-300 px-1.5 py-1 ${i > 2 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr key={i}>
              <td className="border border-stone-300 px-1.5 py-1">{i + 1}</td>
              <td className="border border-stone-300 px-1.5 py-1">{l.name}</td>
              <td className="border border-stone-300 px-1.5 py-1">{l.hsn}</td>
              <td className="border border-stone-300 px-1.5 py-1 text-right num">{fmtQty(l.qty, l.unit)}</td>
              <td className="border border-stone-300 px-1.5 py-1 text-right num">{inr2(l.rate)}/{l.unit === 'kg' ? 'kg' : l.unit}</td>
              <td className="border border-stone-300 px-1.5 py-1 text-right num">{l.discount ? inr2(l.discount) : '—'}</td>
              <td className="border border-stone-300 px-1.5 py-1 text-right num">{inr2(l.taxable)}</td>
              {inter ? (
                <td className="border border-stone-300 px-1.5 py-1 text-right num">{l.gstRate}% · {inr2(l.tax)}</td>
              ) : (
                <>
                  <td className="border border-stone-300 px-1.5 py-1 text-right num">{l.gstRate / 2}% · {inr2(l.tax / 2)}</td>
                  <td className="border border-stone-300 px-1.5 py-1 text-right num">{l.gstRate / 2}% · {inr2(l.tax / 2)}</td>
                </>
              )}
              <td className="border border-stone-300 px-1.5 py-1 text-right num font-medium">{inr2(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between gap-6 mt-3">
        <div className="flex-1 text-stone-600">
          <div className="font-semibold text-stone-800">Amount in words</div>
          <div>{amountInWords(sale.total)}</div>
          <div className="mt-2 font-semibold text-stone-800">Payment</div>
          {receipts.length === 0 && <div>No payment received (on credit)</div>}
          {receipts.map((p) => <div key={p.id}>{p.mode} {inr2(p.amount)}{p.ref ? ` · Ref ${p.ref}` : ''}{p.provider && p.mode === 'UPI' ? ` (${p.provider})` : ''}</div>)}
          {pays.filter((p) => p.type === 'refund').map((p) => <div key={p.id} className="text-red-700">Refunded {p.mode} {inr2(p.amount)} on {fmtDate(p.date)}</div>)}
          {due > 0.5 && <div className="font-semibold text-red-700 mt-1">Balance due: {inr2(due)}</div>}
        </div>
        <div className="w-64">
          {[
            ['Subtotal (as priced)', sale.subtotal], ...(sale.discount ? [['Discount', -sale.discount]] : []), ['Taxable value', sale.taxable],
            ...(inter ? [['IGST', sale.igst]] : [['CGST', sale.cgst], ['SGST', sale.sgst]]), ['Round off', sale.roundOff],
          ].map(([k, v]) => <div key={k as string} className="flex justify-between py-0.5"><span>{k}</span><span className="num">{inr2(v as number)}</span></div>)}
          <div className="flex justify-between border-t-2 border-stone-800 mt-1 pt-1 text-sm font-bold"><span>Total</span><span className="num">{inr2(sale.total)}</span></div>
          {sale.refundedAmount > 0 && <div className="flex justify-between text-red-700 pt-0.5"><span>Refunded</span><span className="num">-{inr2(sale.refundedAmount)}</span></div>}
        </div>
      </div>
      <div className="mt-5 pt-2 border-t border-stone-300 text-[10.5px] text-stone-500 flex justify-between">
        <span>Thank you for shopping with {st.businessName}! Goods once sold are not returnable except for quality issues (same day).</span>
        <span className="text-right">Demo document — not a legal tax invoice.<br />Authorised signatory</span>
      </div>
    </div>
  )
}

export function InvoiceModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  if (!sale) return null
  return (
    <>
      <Modal open onClose={onClose} title={`Invoice ${sale.invoiceNo}`} size="lg"
        footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" onClick={() => window.print()}><Printer className="size-4" />Print invoice</button></>}>
        <InvoiceView sale={sale} />
      </Modal>
      <PrintArea><InvoiceView sale={sale} /></PrintArea>
    </>
  )
}
