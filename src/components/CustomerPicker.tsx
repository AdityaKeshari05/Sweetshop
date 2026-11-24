import { useMemo, useRef, useState } from 'react'
import { Plus, User, X } from 'lucide-react'
import { useStore, act } from '../lib/store'
import type { Customer } from '../lib/types'
import { customerOutstanding } from '../lib/calc'
import { inr } from '../lib/util'
import { Field, Modal, run, useOutside, Badge } from './ui'

export function CustomerForm({ initial, onSaved, onClose }: { initial?: Customer; onSaved?: (c: Customer) => void; onClose: () => void }) {
  const [f, setF] = useState({ name: initial?.name || '', mobile: initial?.mobile || '', address: initial?.address || '', email: initial?.email || '', notes: initial?.notes || '', type: initial?.type || 'Regular', state: initial?.state || 'West Bengal', gstin: initial?.gstin || '', creditLimit: initial?.creditLimit ?? 5000 })
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))
  const save = () => {
    const r = run(() => act.saveCustomer({ ...(initial ? { id: initial.id } : {}), ...f, creditLimit: Number(f.creditLimit) || 0 } as any), initial ? 'Customer updated' : 'Customer added')
    if (r.ok) { onSaved?.(r.value as Customer); onClose() }
  }
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit customer' : 'New customer'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save customer</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer name" required className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Mobile number" required><input className="input" inputMode="tel" placeholder="98300 00000" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
        <Field label="Email (optional)"><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Customer type"><select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}><option>Regular</option><option>Corporate</option><option>Walk-in</option></select></Field>
        <Field label="State (for GST)"><input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="GSTIN (optional)"><input className="input" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
        <Field label="Credit limit (₹)"><input type="number" className="input" value={f.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

export function CustomerPicker({ value, onChange, allowWalkIn = true, label }: { value?: string; onChange: (id: string | undefined) => void; allowWalkIn?: boolean; label?: string }) {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false))
  const sel = s.customers.find((c) => c.id === value)
  const list = useMemo(() => {
    const t = q.toLowerCase()
    return s.customers.filter((c) => !t || c.name.toLowerCase().includes(t) || c.mobile.includes(t)).slice(0, 30)
  }, [q, s.customers])
  return (
    <div ref={ref} className="relative">
      {label && <span className="label">{label}</span>}
      {sel ? (
        <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-2.5 h-9">
          <User className="size-3.5 text-stone-500" />
          <div className="flex-1 min-w-0 truncate text-[13px]"><b className="font-medium">{sel.name}</b> <span className="text-stone-500">· {sel.mobile}</span></div>
          {customerOutstanding(s, sel) > 0 && <Badge tone="red">Due {inr(customerOutstanding(s, sel))}</Badge>}
          <button className="text-stone-400 hover:text-stone-700 cursor-pointer" onClick={() => onChange(undefined)}><X className="size-3.5" /></button>
        </div>
      ) : (
        <input className="input" placeholder={allowWalkIn ? 'Walk-in customer — search name / mobile…' : 'Search customer by name / mobile…'} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} />
      )}
      {open && !sel && (
        <div className="absolute z-30 mt-1 w-full card shadow-xl max-h-64 overflow-y-auto">
          {list.map((c) => (
            <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-stone-50 flex justify-between gap-2 cursor-pointer" onClick={() => { onChange(c.id); setOpen(false); setQ('') }}>
              <span className="text-[13px] truncate">{c.name}</span><span className="text-[11px] text-stone-500 shrink-0">{c.mobile}</span>
            </button>
          ))}
          {!list.length && <div className="px-3 py-3 text-xs text-stone-500">No match.</div>}
          <button className="w-full text-left px-3 py-2 border-t border-stone-200 text-[13px] text-brand-700 font-medium hover:bg-brand-50 flex items-center gap-1.5 cursor-pointer" onClick={() => { setAdding(true); setOpen(false) }}><Plus className="size-3.5" />Add new customer</button>
        </div>
      )}
      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={(c) => onChange(c.id)} />}
    </div>
  )
}
