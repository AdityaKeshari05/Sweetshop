import { useState } from 'react'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { customerOutstanding, receivables, saleDue } from '../lib/calc'
import { can } from '../lib/perm'
import type { Customer, PayMode } from '../lib/types'
import { UPI_PROVIDERS } from '../lib/ops'
import { fmtDate, inr, sum } from '../lib/util'
import { Badge, Card, confirmDialog, DataTable, Field, Modal, NumInput, PageHeader, run, Stat, StatusBadge, type Col } from '../components/ui'
import { CustomerForm } from '../components/CustomerPicker'
import { InvoiceModal } from '../components/Invoice'
import type { Sale } from '../lib/types'

export function ReceiveDueModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const s = useStore()
  const out = customerOutstanding(s, customer)
  const [amount, setAmount] = useState<number | ''>(out)
  const [mode, setMode] = useState<PayMode>('UPI')
  const [ref, setRef] = useState('')
  const [provider, setProvider] = useState(UPI_PROVIDERS[0])
  const submit = () => { if (run(() => act.receiveDue({ customerId: customer.id, amount: Number(amount), mode, ref: ref || undefined, provider }), `Received ${inr(Number(amount))} from ${customer.name}`).ok) onClose() }
  return (
    <Modal open onClose={onClose} title={`Receive payment — ${customer.name}`} subtitle={`Outstanding balance ${inr(out)} (applied to oldest invoices first)`} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Record payment</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)"><NumInput value={amount} onChange={setAmount} /></Field>
        <Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as PayMode)}><option>Cash</option><option>UPI</option><option>Card</option></select></Field>
        {mode === 'UPI' && <><Field label="UPI provider"><select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{UPI_PROVIDERS.map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="UPI reference" hint="Simulated reference auto-generated if blank"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field></>}
      </div>
    </Modal>
  )
}

function Profile({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const s = useStore()
  const role = currentUser(s).role
  const [inv, setInv] = useState<Sale | null>(null)
  const [recv, setRecv] = useState(false)
  const sales = s.sales.filter((x) => x.customerId === customer.id).sort((a, b) => b.at.localeCompare(a.at))
  const orders = s.orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.at.localeCompare(a.at))
  const out = customerOutstanding(s, customer)
  const spend = sum(sales.filter((x) => x.status === 'Completed'), (x) => x.total - x.refundedAmount)
  return (
    <Modal open onClose={onClose} size="xl" title={customer.name} subtitle={`${customer.type} customer · ${customer.mobile}${customer.email ? ' · ' + customer.email : ''}`}
      footer={<>{out > 0 && can(role, 'receiveDue') && <button className="btn-accent mr-auto" onClick={() => setRecv(true)}><Wallet className="size-4" />Receive payment</button>}<button className="btn-secondary" onClick={onClose}>Close</button></>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Lifetime spend" value={inr(spend)} tone="green" /><Stat label="Invoices" value={sales.filter((x) => x.status === 'Completed').length} /><Stat label="Orders" value={orders.length} tone="blue" /><Stat label="Outstanding" value={inr(out)} tone={out > 0 ? 'red' : 'gray'} sub={customer.creditLimit ? `Credit limit ${inr(customer.creditLimit)}` : undefined} />
      </div>
      <div className="text-[13px] text-stone-600 mb-4 grid md:grid-cols-2 gap-x-6 gap-y-1">
        <div><b>Address:</b> {customer.address || '—'}</div><div><b>State:</b> {customer.state}{customer.gstin ? ` · GSTIN ${customer.gstin}` : ''}</div>
        {customer.notes && <div className="md:col-span-2"><b>Notes:</b> {customer.notes}</div>}
      </div>
      <h4 className="text-[13px] font-semibold mb-2">Purchase history</h4>
      <DataTable searchable={false} pageSize={6} rowKey={(x) => x.id} rows={sales} onRowClick={(x) => setInv(x)} columns={[
        { key: 'invoiceNo', header: 'Invoice' }, { key: 'date', header: 'Date', render: (x) => fmtDate(x.date) }, { key: 'items', header: 'Items', value: (x) => x.lines.map((l) => l.name).join(', ') },
        { key: 'total', header: 'Total', align: 'right', render: (x) => inr(x.total) }, { key: 'due', header: 'Due', align: 'right', value: (x) => saleDue(s, x), render: (x) => (saleDue(s, x) > 0.5 ? <b className="text-red-600">{inr(saleDue(s, x))}</b> : '—') },
        { key: 'status', header: 'Status', render: (x) => <StatusBadge s={x.status} /> },
      ] as Col<Sale>[]} />
      {orders.length > 0 && <><h4 className="text-[13px] font-semibold mt-4 mb-2">Orders</h4>
        <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg">{orders.map((o) => <li key={o.id} className="px-3 py-2 flex justify-between text-[13px]"><span>{o.orderNo} · {o.items.map((i) => i.name).join(', ')}</span><span className="flex items-center gap-2"><span className="num">{inr(o.total)}</span><StatusBadge s={o.status} /></span></li>)}</ul></>}
      <InvoiceModal sale={inv} onClose={() => setInv(null)} />
      {recv && <ReceiveDueModal customer={customer} onClose={() => setRecv(false)} />}
    </Modal>
  )
}

export default function Customers({ q }: { q: string }) {
  const s = useStore()
  const role = currentUser(s).role
  const [edit, setEdit] = useState<Customer | 'new' | null>(null)
  const [prof, setProf] = useState<string | null>(null)
  const [recv, setRecv] = useState<Customer | null>(null)
  const rec = receivables(s)
  const spend = (c: Customer) => sum(s.sales.filter((x) => x.customerId === c.id && x.status === 'Completed'), (x) => x.total - x.refundedAmount)
  const cols: Col<Customer>[] = [
    { key: 'name', header: 'Customer', render: (c) => <div><div className="font-medium">{c.name}</div><div className="text-[11px] text-stone-500">{c.address.split(',').slice(-2, -1)[0] || c.address}</div></div>, value: (c) => c.name },
    { key: 'mobile', header: 'Mobile' }, { key: 'type', header: 'Type', render: (c) => <Badge tone={c.type === 'Corporate' ? 'purple' : 'gray'}>{c.type}</Badge> }, { key: 'state', header: 'State' },
    { key: 'orders', header: 'Invoices', align: 'right', value: (c) => s.sales.filter((x) => x.customerId === c.id && x.status === 'Completed').length },
    { key: 'spend', header: 'Lifetime spend', align: 'right', value: spend, render: (c) => inr(spend(c)) },
    { key: 'out', header: 'Outstanding', align: 'right', value: (c) => customerOutstanding(s, c), render: (c) => (customerOutstanding(s, c) > 0 ? <b className="text-red-600">{inr(customerOutstanding(s, c))}</b> : '—') },
    {
      key: 'act', header: '', noSort: true, noCsv: true, render: (c) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          {customerOutstanding(s, c) > 0 && can(role, 'receiveDue') && <button className="btn-ghost btn-sm btn-icon" title="Receive payment" onClick={() => setRecv(c)}><Wallet className="size-4" /></button>}
          {can(role, 'editCustomer') && <button className="btn-ghost btn-sm btn-icon" title="Edit" onClick={() => setEdit(c)}><Pencil className="size-4" /></button>}
          {role !== 'Cashier' && <button className="btn-ghost btn-sm btn-icon text-red-600" title="Delete" onClick={async () => { if (await confirmDialog({ title: 'Delete customer?', message: `Remove ${c.name}? Customers with invoices or orders cannot be deleted.`, danger: true, confirmLabel: 'Delete' })) run(() => act.deleteCustomer(c.id), 'Customer deleted') }}><Trash2 className="size-4" /></button>}
        </div>
      ),
    },
  ]
  return (
    <div>
      <PageHeader title="Customers" subtitle="Walk-in, regular and corporate customers with full purchase history and credit balances." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="size-4" />Add customer</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Customers" value={s.customers.length} /><Stat label="Corporate accounts" value={s.customers.filter((c) => c.type === 'Corporate').length} tone="blue" />
        <Stat label="With outstanding balance" value={rec.byCustomer.size} tone="amber" /><Stat label="Total receivable" value={inr(rec.total)} tone="red" />
      </div>
      <Card><DataTable columns={cols} rows={s.customers} rowKey={(c) => c.id} defaultSearch={q} exportName="customers" onRowClick={(c) => setProf(c.id)} searchPlaceholder="Search name or mobile…" /></Card>
      {edit && <CustomerForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {prof && s.customers.find((c) => c.id === prof) && <Profile customer={s.customers.find((c) => c.id === prof)!} onClose={() => setProf(null)} />}
      {recv && <ReceiveDueModal customer={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}
