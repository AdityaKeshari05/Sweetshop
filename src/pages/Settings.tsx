import { Check, Download, Minus, RotateCcw } from 'lucide-react'
import { useStore, actions, getState } from '../lib/store'
import { ACTION_LABELS, NAV, can } from '../lib/perm'
import type { Role } from '../lib/types'
import { Badge, Card, confirmDialog, Field, NumInput, Notice, PageHeader, run } from '../components/ui'
import { downloadCSV, todayStr } from '../lib/util'

const ROLES: { r: Role; label: string }[] = [{ r: 'Owner', label: 'Owner / Admin' }, { r: 'Manager', label: 'Manager' }, { r: 'Cashier', label: 'Cashier' }, { r: 'Inventory', label: 'Inventory Staff' }]

export default function Settings() {
  const s = useStore()
  const st = s.settings
  const upd = (k: string, v: any) => actions.updateSettings({ [k]: v } as any)
  const Mark = ({ ok }: { ok: boolean }) => (ok ? <Check className="size-4 text-emerald-600 mx-auto" /> : <Minus className="size-4 text-stone-300 mx-auto" />)
  return (
    <div>
      <PageHeader title="Settings & Roles" subtitle="Business configuration, role permissions and demo data controls (Owner/Admin only)." />
      <div className="grid xl:grid-cols-2 gap-4 mb-4">
        <Card title="Business profile">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business name"><input className="input" value={st.businessName} onChange={(e) => upd('businessName', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={st.phone} onChange={(e) => upd('phone', e.target.value)} /></Field>
            <Field label="Address" className="col-span-2"><input className="input" value={st.address} onChange={(e) => upd('address', e.target.value)} /></Field>
            <Field label="Opening time"><input type="time" className="input" value={st.openTime} onChange={(e) => upd('openTime', e.target.value)} /></Field>
            <Field label="Closing time"><input type="time" className="input" value={st.closeTime} onChange={(e) => upd('closeTime', e.target.value)} /></Field>
            <Field label="Late grace (minutes)"><NumInput value={st.lateGraceMin} onChange={(v) => upd('lateGraceMin', Number(v) || 0)} /></Field>
            <Field label="Monthly rent (₹)"><NumInput value={st.monthlyRent} onChange={(v) => upd('monthlyRent', Number(v) || 0)} /></Field>
            <Field label="Shop UPI ID (display only)" className="col-span-2"><input className="input" value={st.upiId} onChange={(e) => upd('upiId', e.target.value)} /></Field>
          </div>
          <p className="text-[11px] text-stone-500 mt-2">Currency INR (₹) · Timezone Asia/Kolkata · GST fields live under GST & Tax.</p>
        </Card>
        <Card title="Demo data">
          <div className="space-y-3 text-[13px] text-stone-600">
            <p>All data lives in this browser’s localStorage. It auto-refreshes to a new “today” each calendar day, so the demo always looks current.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-danger" onClick={async () => { if (await confirmDialog({ title: 'Reset all demo data?', message: 'Every sale, order, stock movement and setting you changed will be replaced with the original sample data. This cannot be undone.', danger: true, confirmLabel: 'Reset demo data' })) run(() => actions.resetDemo(), 'Demo data restored to its original state') }}><RotateCcw className="size-4" />Reset demo data</button>
              <button className="btn-secondary" onClick={() => { const g = getState(); downloadCSV('backup-summary_' + todayStr(), ['Collection', 'Records'], [['Products', g.products.length], ['Batches', g.batches.length], ['Stock ledger', g.ledger.length], ['Sales', g.sales.length], ['Payments', g.payments.length], ['Customers', g.customers.length], ['Orders', g.orders.length], ['Suppliers', g.suppliers.length], ['Purchase invoices', g.purchaseInvoices.length], ['Expenses', g.expenses.length], ['Staff', g.staff.length], ['Attendance', g.attendance.length]]) }}><Download className="size-4" />Data summary (CSV)</button>
            </div>
            <Notice tone="blue">Architecture note: all business rules live in <code>src/lib/ops.ts</code> and read/write through one store, so a real backend, payment gateway, WhatsApp or accounting integration can replace the local layer later.</Notice>
          </div>
        </Card>
      </div>
      <Card title="Users & role permissions" subtitle="Switch role from the profile menu to feel the difference. Locked menu items appear dimmed.">
        <div className="grid md:grid-cols-4 gap-3 mb-5">
          {s.users.map((u) => <div key={u.id} className="rounded-lg border border-stone-200 p-3 flex items-center gap-3"><div className="size-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">{u.name.split(' ').map((p) => p[0]).join('')}</div><div><div className="text-[13px] font-medium">{u.name}</div><Badge tone={u.role === s.users.find((x) => x.id === s.userId)?.role ? 'brand' : 'gray'}>{u.title}</Badge></div></div>)}
        </div>
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-[13px]">
            <thead><tr><th className="th">Module / capability</th>{ROLES.map((r) => <th key={r.r} className="th text-center">{r.label}</th>)}</tr></thead>
            <tbody>
              <tr><td colSpan={5} className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Modules</td></tr>
              {NAV.map((n) => <tr key={n.id}><td className="td">{n.label}</td>{ROLES.map((r) => <td key={r.r} className="td"><Mark ok={n.roles.includes(r.r)} /></td>)}</tr>)}
              <tr><td colSpan={5} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Sensitive actions</td></tr>
              {ACTION_LABELS.map(([k, l]) => <tr key={k}><td className="td">{l}</td>{ROLES.map((r) => <td key={r.r} className="td"><Mark ok={can(r.r, k)} /></td>)}</tr>)}
              <tr><td className="td">POS discount above 10%</td>{ROLES.map((r) => <td key={r.r} className="td"><Mark ok={r.r !== 'Cashier' && r.r !== 'Inventory'} /></td>)}</tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
