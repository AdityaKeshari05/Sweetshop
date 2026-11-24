import { useMemo, useState } from 'react'
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { periodSummary, receivables, stockValue, supplierBalances } from '../lib/calc'
import { addDays, cn, datesBetween, fmtDate, fmtDay, fmtMonth, inr, inr2, monthEnd, monthStart, pct, sum, todayStr, weekStart } from '../lib/util'
import { Card, Notice, PageHeader, Segmented, Stat } from '../components/ui'

type P = 'day' | 'week' | 'month'
const COLORS = ['#8f2f44', '#d97706', '#2f7d5b', '#4f6d9a', '#8b5cf6', '#78716c']

export default function PnL() {
  const s = useStore()
  const today = todayStr()
  const [p, setP] = useState<P>('month')
  const [anchor, setAnchor] = useState(today)
  const [from, to] = p === 'day' ? [anchor, anchor] : p === 'week' ? [weekStart(anchor), addDays(weekStart(anchor), 6)] : [monthStart(anchor), monthEnd(anchor)]
  const step = (dir: number) => setAnchor(p === 'day' ? addDays(anchor, dir) : p === 'week' ? addDays(anchor, 7 * dir) : addDays(monthStart(anchor), dir > 0 ? 32 : -1))
  const m = periodSummary(s, from, to)
  const trendDays = useMemo(() => {
    if (p === 'day') return datesBetween(addDays(anchor, -13), anchor)
    return datesBetween(from, to > today ? today : to)
  }, [p, anchor, from, to, today])
  const trend = trendDays.map((d) => { const x = periodSummary(s, d, d); return { name: fmtDay(d), 'Net sales': Math.round(x.netSales), 'Gross profit': Math.round(x.grossProfit), 'Net profit': Math.round(x.netProfit) } })
  const exp = [
    { name: 'Cost of goods sold', value: m.cogs }, { name: 'Salaries', value: m.salary }, { name: 'Rent', value: m.rent }, { name: 'Utilities', value: m.utilities },
    { name: 'Packaging', value: m.packaging }, { name: 'Wastage', value: m.wastage }, { name: 'Other', value: m.otherExp },
  ].filter((x) => x.value > 0)
  const rec = receivables(s)
  const sb = supplierBalances(s)
  const payable = sum([...sb.bySupplier.values()], (b) => b.outstanding)
  const gm = pct(m.grossProfit, m.netSales), nm = pct(m.netProfit, m.netSales)
  const Row = ({ label, v, bold, indent, neg, hint }: { label: string; v: number; bold?: boolean; indent?: boolean; neg?: boolean; hint?: string }) => (
    <tr className={cn(bold && 'bg-stone-50')}>
      <td className={cn('td', bold && 'font-semibold', indent && 'pl-8 text-stone-600')}>{label}{hint && <div className="text-[11px] text-stone-400 font-normal">{hint}</div>}</td>
      <td className={cn('td text-right num', bold && 'font-semibold', neg && v > 0 && 'text-red-700')}>{neg && v > 0 ? '−' : ''}{inr2(Math.abs(v))}</td>
    </tr>
  )
  const label = p === 'day' ? fmtDate(from) : p === 'week' ? `${fmtDate(from)} – ${fmtDate(to)}` : fmtMonth(from)
  return (
    <div>
      <PageHeader title="Profit & Loss" subtitle="Net sales exclude GST. Cost of goods sold is the cost of inventory actually sold — purchases are not expensed twice." actions={
        <><Segmented value={p} onChange={setP} options={[{ id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }]} />
          <div className="flex items-center gap-1"><button className="btn-secondary btn-icon" onClick={() => step(-1)}><ChevronLeft className="size-4" /></button><input type="date" className="input !w-40" value={anchor} max={today} onChange={(e) => setAnchor(e.target.value)} /><button className="btn-secondary btn-icon" onClick={() => step(1)}><ChevronRight className="size-4" /></button></div></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Net sales (ex-GST)" value={inr(m.netSales)} sub={label} tone="brand" /><Stat label="Gross profit" value={inr(m.grossProfit)} sub={`${gm.toFixed(1)}% gross margin`} tone="green" />
        <Stat label="Operating costs" value={inr(m.opex + m.wastage)} sub="incl. wastage" tone="amber" /><Stat label="Net operating profit" value={inr(m.netProfit)} sub={`${nm.toFixed(1)}% net margin`} tone={m.netProfit >= 0 ? 'green' : 'red'} /><Stat label="GST liability (separate)" value={inr(m.outputTax - m.inputTax)} sub="output − input, not profit" tone="gray" />
      </div>
      <div className="grid xl:grid-cols-[1fr_1fr] gap-4 mb-4">
        <Card title={`Statement — ${label}`} pad={false}>
          <table className="w-full text-[13px]">
            <tbody>
              <tr><td colSpan={2} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Revenue</td></tr>
              <Row label="Gross sales (before discount, ex-GST)" v={m.grossSales} indent /><Row label="Less: discounts" v={m.discounts} indent neg /><Row label="Less: refunds & returns" v={m.refunds} indent neg />
              <Row label="Net sales" v={m.netSales} bold />
              <tr><td colSpan={2} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cost of goods</td></tr>
              <Row label="Cost of goods sold" v={m.cogs} indent neg hint="Cost of inventory actually sold (batch cost, FEFO)" />
              <Row label="Gross profit" v={m.grossProfit} bold />
              <tr><td colSpan={2} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Operating expenses</td></tr>
              <Row label="Wastage cost (expired / spoiled)" v={m.wastage} indent neg /><Row label="Staff salaries" v={m.salary} indent neg hint="Monthly payroll ÷ days in month" /><Row label="Rent allocation" v={m.rent} indent neg hint={`${inr(s.settings.monthlyRent)} per month ÷ days`} />
              <Row label="Electricity & fuel" v={m.utilities} indent neg /><Row label="Packaging" v={m.packaging} indent neg /><Row label="Other expenses" v={m.otherExp} indent neg />
              <Row label="Estimated net operating profit" v={m.netProfit} bold />
              <tr><td className="td text-stone-500">Gross margin / Net margin</td><td className="td text-right num text-stone-600">{gm.toFixed(1)}% / {nm.toFixed(1)}%</td></tr>
              <tr><td colSpan={2} className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Tax position — shown separately, not part of profit</td></tr>
              <Row label="Output GST collected on sales" v={m.outputTax} indent /><Row label="Input GST paid on purchases" v={m.inputTax} indent /><Row label="Net GST payable (demo)" v={m.outputTax - m.inputTax} bold />
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card title="Revenue & profit trend"><div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ left: -8, right: 8, top: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" /><XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} /><YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)} /><Tooltip formatter={(v: any) => inr(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="Net sales" stroke="#8f2f44" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="Gross profit" stroke="#2f7d5b" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="Net profit" stroke="#d97706" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Card>
          <Card title="Where the money goes" subtitle="Cost and expense breakdown for the period">
            <div className="flex items-center gap-4"><div className="size-40 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={exp} dataKey="value" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">{exp.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => inr(Number(v))} /></PieChart></ResponsiveContainer></div>
              <ul className="flex-1 space-y-1.5 text-[13px]">{exp.map((e, i) => <li key={e.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{e.name}</span><b className="num">{inr(e.value)}</b></li>)}</ul></div>
          </Card>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <Card title="Profit is not cash — how the numbers differ" subtitle="Seven different things a shop owner often mixes up">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ['1 · Sales revenue', inr(m.netSales), 'Net sales excluding GST for the period'], ['2 · Cash / UPI / card collections', inr(m.receipts), 'Money actually received (includes advances & dues, plus GST)'],
              ['3 · Customer receivables', inr(rec.total), 'Billed but not yet paid — still to collect'], ['4 · Supplier payables', inr(payable), 'Purchases received but not yet paid'],
              ['5 · Inventory value', inr(stockValue(s)), 'Stock on hand at cost — an asset, not an expense'], ['6 · Gross profit', inr(m.grossProfit), 'Net sales − cost of goods sold'], ['7 · Est. operating profit', inr(m.netProfit), 'Gross profit − wastage − operating costs'],
            ].map(([k, v, d]) => <div key={k} className="rounded-lg bg-stone-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{k}</div><div className="text-lg font-semibold num mt-0.5">{v}</div><div className="text-[11px] text-stone-500">{d}</div></div>)}
          </div>
        </Card>
        <Card title="Assumptions used in this demo">
          <ul className="list-disc pl-4 text-[12px] text-stone-600 space-y-1.5">
            <li>Revenue is recognised on the invoice date (POS bill, or order delivery).</li><li>GST is excluded from revenue and shown as a liability.</li>
            <li>COGS uses the actual batch cost of stock sold; returned & restocked items reverse COGS.</li><li>Stock purchases increase inventory — they are never expensed on purchase.</li>
            <li>Salaries and rent are spread evenly per calendar day.</li><li>Electricity, packaging and other costs are the expenses you record.</li><li>Figures are estimates for demonstration, not audited accounts.</li>
          </ul>
        </Card>
      </div>
      {p === 'day' && m.bills === 0 && <div className="mt-4"><Notice tone="blue">No sales recorded on this date.</Notice></div>}
    </div>
  )
}
