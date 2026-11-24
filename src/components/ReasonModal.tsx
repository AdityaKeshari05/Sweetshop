import { useState, type ReactNode } from 'react'
import { Field, Modal } from './ui'

export function ReasonModal({ title, label = 'Reason', presets, confirmLabel = 'Confirm', danger, onClose, onSubmit, children }: {
  title: string; label?: string; presets?: string[]; confirmLabel?: string; danger?: boolean; onClose: () => void; onSubmit: (reason: string) => void; children?: ReactNode
}) {
  const [reason, setReason] = useState(presets?.[0] || '')
  return (
    <Modal open onClose={onClose} title={title} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => onSubmit(reason)}>{confirmLabel}</button></>}>
      <div className="space-y-3">
        {children}
        {presets && <div className="flex flex-wrap gap-1.5">{presets.map((p) => <button key={p} onClick={() => setReason(p)} className={`badge cursor-pointer ${reason === p ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{p}</button>)}</div>}
        <Field label={label} required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </div>
    </Modal>
  )
}
