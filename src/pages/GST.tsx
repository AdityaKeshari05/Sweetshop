import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useStore, act, actions, currentUser } from '../lib/store'
import { computeBill } from '../lib/calc'
import { buildReport, REPORTS, saleNetTax } from '../lib/reports'
import { can } from '../lib/perm'
import type { Sale } from '../lib/types'
import { fmtDate, inr, inr2 } from '../lib/util'
import { Badge, Card, DataTable, Field, Notice, NumInput, PageHeader, RangePicker, rangeFor, run, Tabs, toast, type Col, type DateRange } from '../components/ui'
import { ReportTable } from '../components/ReportTable'
import { InvoiceModal } from '../components/Invoice'

export default function GST() {
  const s = useStore()
  const role = currentUser(s).role
  const [tab, setTab] = useState<'cfg' | 'inv' | 'rep'>('cfg')
  const [range, setRange] = useState<DateRange>(rangeFor('month'))
  const [rep, setRep] = useState('gst-sales-register')
  const [view, setView] = useState<Sale | null>(null)
  const [calc, setCalc] = useState({ pid: s.products[0].id, qty: 1 as number | '', supply: 'intra' as 'intra' | 'inter' })
  const st = s.settings
  const edit = can(role, 'editGst')
  const upd = (k: string, v: any) => actions.updateSettings({ [k]: v } as any)
  const cp = s.products.find((p) => p.id === calc.pid)!
  const cb = computeBill([{ productId: cp.id, name: cp.name, unit: cp.unit, hsn: cp.hsn, gstRate: cp.gstRate, qty: Number(calc.qty) || 0, rate: cp.sellPrice }], 0, calc.supply, st.pricesIncludeGst)
  const sales = useMemo(() => s.sales.filter((x) => x.status === 'Completed' && x.date >= range.from && x.date <= range.to).sort((a, b) => b.at.localeCompare(a.at)), [s.sales, range])
  const report = useMemo(() => buildReport(rep, s, range.from, range.to), [rep, s, range])
  const gstReports = REPORTS.filter((r) => r.group === 'Tax (demo)')
  const cols: Col<Sale>[] = [
    { key: 'invoiceNo', header: 'Invoice', render: (x) => <b>{x.invoiceNo}</b> }, { key: 'date', header: 'Date', value: (x) => x.date, render: (x) => fmtDate(x.date) }, { key: 'customerName', header: 'Customer' }, { key: 'gstin', header: 'Customer GSTIN', value: (x) => x.customerGstin || 'Unregistered' },
    { key: 'supply', header: 'Supply', value: (x) => (x.supply === 'intra' ? 'Intra-state' : 'Inter-state'), render: (x) => <Badge tone={x.supply === 'intra' ? 'gray' : 'purple'}>{x.supply === 'intra' ? 'CGST+SGST' : 'IGST'}</Badge> },
    { key: 'taxable', header: 'Taxable', align: 'right', value: (x) => saleNetTax(x).taxable, render: (x) => inr2(saleNetTax(x).taxable) }, { key: 'cgst', header: 'CGST', align: 'right', value: (x) => saleNetTax(x).cgst, render: (x) => inr2(saleNetTax(x).cgst) },
    { key: 'sgst', header: 'SGST', align: 'right', value: (x) => saleNetTax(x).sgst, render: (x) => inr2(saleNetTax(x).sgst) }, { key: 'igst', header: 'IGST', align: 'right', value: (x) => saleNetTax(x).igst, render: (x) => inr2(saleNetTax(x).igst) },
    { key: 'total', header: 'Total', align: 'right', value: (x) => x.total, render: (x) => <b>{inr(x.total)}</b> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (x) => <button className="btn-ghost btn-sm btn-icon" title="Print GST invoice" onClick={(e) => { e.stopPropagation(); setView(x) }}><Printer className="size-4" /></button> },
  ]
  return (
    <div>
      <PageHeader title="GST & Tax" subtitle="GST configuration, per-product rates, printable GST invoices and demonstration tax registers." actions={tab !== 'cfg' ? <RangePicker value={range} onChange={setRange} /> : undefined} />
      <div className="mb-4"><Notice tone="amber"><b>Demonstration only.</b> GST rates and registers here are configurable sample calculations. They are not filed GST returns or certified tax compliance. Confirm the correct rate/HSN for each product with your tax advisor.</Notice></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'cfg', label: 'Configuration' }, { id: 'inv', label: 'GST invoices' }, { id: 'rep', label: 'Registers & summaries' }]} />
      {tab === 'cfg' && (
        <div className="grid xl:grid-cols-[400px_1fr] gap-4">
          <div className="space-y-4">
            <Card title="Business & GSTIN">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Business legal name" className="col-span-2"><input className="input" disabled={!edit} value={st.legalName} onChange={(e) => upd('legalName', e.target.value)} /></Field>
                <Field label="GSTIN" className="col-span-2"><input className="input font-mono" disabled={!edit} value={st.gstin} onChange={(e) => upd('gstin', e.target.value.toUpperCase())} /></Field>
                <Field label="Billing address" className="col-span-2"><input className="input" disabled={!edit} value={st.address} onChange={(e) => upd('address', e.target.value)} /></Field>
                <Field label="State"><input className="input" disabled={!edit} value={st.state} onChange={(e) => upd('state', e.target.value)} /></Field>
                <Field label="State code"><input className="input" disabled={!edit} value={st.stateCode} onChange={(e) => upd('stateCode', e.target.value)} /></Field>
                <Field label="FSSAI licence" className="col-span-2"><input className="input" disabled={!edit} value={st.fssai} onChange={(e) => upd('fssai', e.target.value)} /></Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] mt-3"><input type="checkbox" disabled={!edit} checked={st.pricesIncludeGst} onChange={(e) => upd('pricesIncludeGst', e.target.checked)} />Selling prices already include GST</label>
              <p className="text-[11px] text-stone-500 mt-1">Applies to new bills. Invoices already issued keep their saved tax breakup.</p>
            </Card>
            <Card title="GST calculator" subtitle="Check how a line is taxed for intra- vs inter-state supply">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Product" className="col-span-2"><select className="input" value={calc.pid} onChange={(e) => setCalc({ ...calc, pid: e.target.value })}>{s.products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.gstRate}%)</option>)}</select></Field>
                <Field label={`Qty (${cp.unit})`}><NumInput value={calc.qty} onChange={(v) => setCalc({ ...calc, qty: v })} step="any" /></Field>
                <Field label="Supply"><select className="input" value={calc.supply} onChange={(e) => setCalc({ ...calc, supply: e.target.value as any })}><option value="intra">Intra-state</option><option value="inter">Inter-state</option></select></Field>
              </div>
              <dl className="mt-3 text-[13px] space-y-1">
                <div className="flex justify-between"><dt>Taxable value</dt><dd className="num">{inr2(cb.taxable)}</dd></div>
                {calc.supply === 'intra' ? <><div className="flex justify-between"><dt>CGST @ {cp.gstRate / 2}%</dt><dd className="num">{inr2(cb.cgst)}</dd></div><div className="flex justify-between"><dt>SGST @ {cp.gstRate / 2}%</dt><dd className="num">{inr2(cb.sgst)}</dd></div></> : <div className="flex justify-between"><dt>IGST @ {cp.gstRate}%</dt><dd className="num">{inr2(cb.igst)}</dd></div>}
                <div className="flex justify-between"><dt>Round off</dt><dd className="num">{inr2(cb.roundOff)}</dd></div>
                <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold"><dt>Invoice total</dt><dd className="num">{inr2(cb.total)}</dd></div>
              </dl>
            </Card>
          </div>
          <Card title="Product-wise GST rate & HSN" subtitle="Edit any rate — it applies to future bills immediately. No universal rate is hard-coded." pad={false}>
            <div className="overflow-auto max-h-[640px]">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0"><tr><th className="th">Product</th><th className="th">Category</th><th className="th w-32">HSN / SAC</th><th className="th w-28">GST rate</th></tr></thead>
                <tbody>
                  {s.products.filter((p) => !p.archived).map((p) => (
                    <tr key={p.id}>
                      <td className="td font-medium">{p.name}</td><td className="td text-stone-500">{p.category}</td>
                      <td className="td"><input className="input !h-8" disabled={!edit} value={p.hsn} onChange={(e) => act.updateProduct(p.id, { hsn: e.target.value })} /></td>
                      <td className="td"><select className="input !h-8" disabled={!edit} value={p.gstRate} onChange={(e) => { act.updateProduct(p.id, { gstRate: Number(e.target.value) }); toast.success(`${p.name} GST set to ${e.target.value}%`) }}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {tab === 'inv' && <Card><DataTable columns={cols} rows={sales} rowKey={(x) => x.id} exportName="gst-invoices" pageSize={14} onRowClick={(x) => setView(x)} /></Card>}
      {tab === 'rep' && (
        <div className="grid lg:grid-cols-[230px_1fr] gap-4">
          <Card pad={false} className="h-fit"><nav className="p-2">{gstReports.map((r) => <button key={r.id} onClick={() => setRep(r.id)} className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer ${rep === r.id ? 'bg-brand-50 text-brand-800 font-medium' : 'text-stone-600 hover:bg-stone-50'}`}>{r.label.replace('GST — ', '')}</button>)}</nav></Card>
          <Card title={report.title} subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`}><ReportTable report={report} filename={`${rep}_${range.from}_${range.to}`} /></Card>
        </div>
      )}
      <InvoiceModal sale={view} onClose={() => setView(null)} />
    </div>
  )
}
