import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore, act } from '../lib/store'
import { periodSummary } from '../lib/calc'
import { EXPENSE_CATS, type Expense, type PayMode } from '../lib/types'
import { fmtDate, inr, sum, todayStr } from '../lib/util'
import { Badge, Card, confirmDialog, DataTable, Field, Modal, NumInput, PageHeader, RangePicker, rangeFor, run, Stat, type Col, type DateRange } from '../components/ui'

export default function Expenses() {
  const s = useStore()
  const [range, setRange] = useState<DateRange>(rangeFor('month'))
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ date: todayStr(), category: 'Electricity' as string, amount: '' as number | '', mode: 'Cash' as PayMode | 'Bank', note: '' })
  const rows = s.expenses.filter((e) => e.date >= range.from && e.date <= range.to).sort((a, b) => b.date.localeCompare(a.date))
  const sm = periodSummary(s, range.from, range.to)
  const cols: Col<Expense>[] = [
    { key: 'date', header: 'Date', value: (e) => e.date, render: (e) => fmtDate(e.date) }, { key: 'category', header: 'Category', render: (e) => <Badge tone="gray">{e.category}</Badge> },
    { key: 'note', header: 'Description', value: (e) => e.note || '' }, { key: 'mode', header: 'Paid via' }, { key: 'by', header: 'Recorded by', value: (e) => e.by || '' },
    { key: 'amount', header: 'Amount', align: 'right', value: (e) => e.amount, render: (e) => <b>{inr(e.amount)}</b> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (e) => (e.auto ? <Badge>Auto</Badge> : <button className="btn-ghost btn-sm btn-icon text-red-600" onClick={async () => { if (await confirmDialog({ title: 'Delete expense?', message: `${e.category} · ${inr(e.amount)}`, danger: true, confirmLabel: 'Delete' })) run(() => act.deleteExpense(e.id), 'Expense deleted') }}><Trash2 className="size-4" /></button>) },
  ]
  return (
    <div>
      <PageHeader title="Expenses" subtitle="Record daily operating expenses. Salaries and rent are allocated automatically per day in the P&L; purchases of stock are NOT expenses (they become inventory, then COGS when sold)." actions={<><RangePicker value={range} onChange={setRange} /><button className="btn-primary" onClick={() => setAdd(true)}><Plus className="size-4" />Add expense</button></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Recorded expenses" value={inr(sum(rows, (e) => e.amount))} /><Stat label="Utilities (power, gas)" value={inr(sm.utilities)} tone="amber" /><Stat label="Packaging" value={inr(sm.packaging)} tone="blue" />
        <Stat label="Salaries (allocated)" value={inr(sm.salary)} tone="gray" sub="monthly payroll ÷ days" /><Stat label="Rent (allocated)" value={inr(sm.rent)} tone="gray" sub={`${inr(s.settings.monthlyRent)} / month`} />
      </div>
      <Card><DataTable columns={cols} rows={rows} rowKey={(e) => e.id} exportName="expenses" pageSize={14} /></Card>
      {add && (
        <Modal open onClose={() => setAdd(false)} size="sm" title="Add expense" footer={<><button className="btn-secondary" onClick={() => setAdd(false)}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.addExpense({ date: f.date, category: f.category, amount: Number(f.amount), mode: f.mode, note: f.note }), 'Expense recorded').ok && setAdd(false)}>Save expense</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" className="input" value={f.date} max={todayStr()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount (₹)" required><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} step="any" /></Field>
            <Field label="Paid via"><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as any })}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option></select></Field>
            <Field label="Description" className="col-span-2"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. LPG cylinder refill" /></Field>
          </div>
          <p className="text-[11px] text-stone-500 mt-2">Cash expenses reduce the expected drawer balance at closing.</p>
        </Modal>
      )}
    </div>
  )
}
