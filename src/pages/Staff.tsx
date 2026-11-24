import { useMemo, useState } from 'react'
import { Pencil, Plus, UserMinus } from 'lucide-react'
import { useStore, act, actions } from '../lib/store'
import { isLate } from '../lib/calc'
import type { AttStatus, Staff as StaffT } from '../lib/types'
import { cn, dayDiff, daysInMonth, datesBetween, downloadCSV, fmtDate, fmtMonth, fmtTime, inr, monthEnd, monthStart, nowTimeStr, r2, sum, todayStr, weekday } from '../lib/util'
import { Badge, Card, confirmDialog, DataTable, Field, Modal, NumInput, PageHeader, run, Stat, StatusBadge, Tabs, toast, type Col } from '../components/ui'

const STATUSES: AttStatus[] = ['Present', 'Half-day', 'Leave', 'Absent']
const LETTER: Record<string, string> = { Present: 'P', 'Half-day': 'H', Leave: 'L', Absent: 'A' }
const LCOL: Record<string, string> = { Present: 'bg-emerald-100 text-emerald-700', 'Half-day': 'bg-amber-100 text-amber-800', Leave: 'bg-sky-100 text-sky-700', Absent: 'bg-red-100 text-red-700' }

function StaffForm({ initial, onClose }: { initial?: StaffT; onClose: () => void }) {
  const [f, setF] = useState({ name: initial?.name || '', role: initial?.role || 'Sales Executive', phone: initial?.phone || '', joined: initial?.joined || todayStr(), monthlySalary: initial?.monthlySalary ?? 15000, address: initial?.address || '' })
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit staff member' : 'Add staff member'} size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.saveStaff({ ...(initial ? { id: initial.id } : {}), ...f, monthlySalary: Number(f.monthlySalary) } as any), 'Staff member saved').ok && onClose()}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" required className="col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['Shop Manager', 'Sales Executive', 'Cashier', 'Inventory Assistant', 'Sweet Maker (Halwai)', 'Delivery Executive', 'Helper'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Joining date"><input type="date" className="input" value={f.joined} onChange={(e) => setF({ ...f, joined: e.target.value })} /></Field>
        <Field label="Monthly salary (₹)"><NumInput value={f.monthlySalary} onChange={(v) => setF({ ...f, monthlySalary: v as number })} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

export default function Staff() {
  const s = useStore()
  const today = todayStr()
  const [tab, setTab] = useState<'att' | 'dir' | 'month' | 'sal'>('att')
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [edit, setEdit] = useState<StaffT | 'new' | null>(null)
  const active = s.staff.filter((x) => x.active)
  const att = (id: string, d = date) => s.attendance.find((a) => a.staffId === id && a.date === d)
  const mark = (id: string, status: AttStatus) => run(() => act.markAttendance({ staffId: id, date, status, checkIn: date === today ? (att(id)?.checkIn || nowTimeStr()) : undefined }))
  const count = (k: AttStatus) => active.filter((x) => att(x.id)?.status === k).length
  const lateN = active.filter((x) => isLate(att(x.id), s.settings.openTime, s.settings.lateGraceMin)).length
  const mFrom = month + '-01', mTo = monthEnd(mFrom)
  const mDays = datesBetween(mFrom, mTo)
  const dim = daysInMonth(mFrom)
  const stats = (id: string) => {
    const a = s.attendance.filter((x) => x.staffId === id && x.date >= mFrom && x.date <= mTo)
    const c = (k: string) => a.filter((x) => x.status === k).length
    const late = a.filter((x) => isLate(x, s.settings.openTime, s.settings.lateGraceMin)).length
    const payable = c('Present') + 0.5 * c('Half-day') + c('Leave')
    return { present: c('Present'), half: c('Half-day'), leave: c('Leave'), absent: c('Absent'), late, marked: a.length, payable }
  }
  const salRows = useMemo(() => active.map((st) => { const x = stats(st.id); const perDay = st.monthlySalary / dim; return { st, ...x, perDay, estimate: r2(perDay * x.payable) } }), [s.attendance, s.staff, month])
  const dirCols: Col<StaffT>[] = [
    { key: 'name', header: 'Name', render: (x) => <div className="flex items-center gap-2.5"><div className="size-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">{x.name.split(' ').map((p) => p[0]).join('')}</div><div><div className="font-medium">{x.name}</div><div className="text-[11px] text-stone-500">{x.role}</div></div></div>, value: (x) => x.name },
    { key: 'phone', header: 'Phone' }, { key: 'joined', header: 'Joined', render: (x) => fmtDate(x.joined), value: (x) => x.joined },
    { key: 'sal', header: 'Monthly salary', align: 'right', value: (x) => x.monthlySalary, render: (x) => inr(x.monthlySalary) },
    { key: 'today', header: 'Today', value: (x) => att(x.id, today)?.status || '—', render: (x) => (att(x.id, today) ? <StatusBadge s={att(x.id, today)!.status} /> : <Badge>Not marked</Badge>) },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (x) => <div className="flex gap-1 justify-end"><button className="btn-ghost btn-sm btn-icon" onClick={() => setEdit(x)}><Pencil className="size-4" /></button><button className="btn-ghost btn-sm btn-icon text-red-600" title="Deactivate" onClick={async () => { if (await confirmDialog({ title: `Deactivate ${x.name}?`, message: 'They will no longer appear in attendance or salary, but history is kept.', danger: true, confirmLabel: 'Deactivate' })) { actions.deleteStaff(x.id); toast.success('Staff member deactivated') } }}><UserMinus className="size-4" /></button></div> },
  ]
  return (
    <div>
      <PageHeader title="Staff & Attendance" subtitle="Staff directory, daily check-in / check-out, monthly attendance and estimated salary." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="size-4" />Add staff</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'att', label: 'Daily attendance' }, { id: 'dir', label: 'Staff directory' }, { id: 'month', label: 'Monthly report' }, { id: 'sal', label: 'Salary estimate' }]} />
      {tab === 'att' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="Present" value={count('Present')} tone="green" /><Stat label="Half-day" value={count('Half-day')} tone="amber" /><Stat label="On leave" value={count('Leave')} tone="blue" /><Stat label="Absent" value={count('Absent')} tone="red" />
            <Stat label="Late arrivals" value={lateN} tone="amber" sub={`after ${fmtTime(s.settings.openTime)} + ${s.settings.lateGraceMin} min`} /><Stat label="Not marked" value={active.filter((x) => !att(x.id)).length} tone="gray" />
          </div>
          <Card title="Mark attendance" actions={<><input type="date" className="input !w-40" value={date} max={today} onChange={(e) => setDate(e.target.value)} /><button className="btn-secondary btn-sm" onClick={() => active.filter((x) => !att(x.id)).forEach((x) => mark(x.id, 'Present'))}>Mark remaining present</button></>} pad={false}>
            <table className="w-full text-[13px]">
              <thead><tr><th className="th">Staff</th><th className="th">Status</th><th className="th">Check-in</th><th className="th">Check-out</th><th className="th">Flags</th></tr></thead>
              <tbody>
                {active.map((st) => { const a = att(st.id); const works = a && (a.status === 'Present' || a.status === 'Half-day'); return (
                  <tr key={st.id}>
                    <td className="td"><div className="font-medium">{st.name}</div><div className="text-[11px] text-stone-500">{st.role}</div></td>
                    <td className="td"><div className="inline-flex rounded-lg bg-stone-100 p-0.5">{STATUSES.map((k) => <button key={k} onClick={() => mark(st.id, k)} className={cn('px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer', a?.status === k ? LCOL[k] + ' shadow-sm' : 'text-stone-500 hover:text-stone-800')}>{k}</button>)}</div></td>
                    <td className="td"><div className="flex items-center gap-1.5"><input type="time" className="input !w-28 !h-8" disabled={!works} value={a?.checkIn || ''} onChange={(e) => run(() => act.markAttendance({ staffId: st.id, date, status: a!.status, checkIn: e.target.value }))} />{works && date === today && !a?.checkIn && <button className="btn-secondary btn-sm" onClick={() => mark(st.id, a!.status)}>Now</button>}</div></td>
                    <td className="td"><div className="flex items-center gap-1.5"><input type="time" className="input !w-28 !h-8" disabled={!works} value={a?.checkOut || ''} onChange={(e) => run(() => act.markAttendance({ staffId: st.id, date, status: a!.status, checkOut: e.target.value }))} />{works && date === today && !a?.checkOut && <button className="btn-secondary btn-sm" onClick={() => run(() => act.markAttendance({ staffId: st.id, date, status: a!.status, checkOut: nowTimeStr() }), `${st.name} checked out`)}>Check out</button>}</div></td>
                    <td className="td">{isLate(a, s.settings.openTime, s.settings.lateGraceMin) && <Badge tone="amber">Late arrival</Badge>}{!a && <Badge>Not marked</Badge>}</td>
                  </tr>) })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {tab === 'dir' && <Card><DataTable columns={dirCols} rows={active} rowKey={(x) => x.id} exportName="staff" searchable={false} /></Card>}
      {tab === 'month' && (
        <Card title={`Monthly attendance — ${fmtMonth(mFrom)}`} actions={<><input type="month" className="input !w-40" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /><button className="btn-secondary btn-sm" onClick={() => downloadCSV(`attendance_${month}`, ['Staff', 'Present', 'Half-day', 'Leave', 'Absent', 'Late', 'Payable days'], active.map((st) => { const x = stats(st.id); return [st.name, x.present, x.half, x.leave, x.absent, x.late, x.payable] }))}>Export CSV</button></>} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr><th className="th sticky left-0 bg-stone-50">Staff</th>{mDays.map((d) => <th key={d} className={cn('th !px-1 text-center', d === today && '!text-brand-700')}><div>{+d.slice(8)}</div><div className="font-normal opacity-60">{weekday(d)[0]}</div></th>)}<th className="th text-center">P</th><th className="th text-center">H</th><th className="th text-center">L</th><th className="th text-center">A</th><th className="th text-center">Late</th><th className="th text-right">Payable</th></tr></thead>
              <tbody>
                {active.map((st) => { const x = stats(st.id); return (
                  <tr key={st.id}><td className="td sticky left-0 bg-white font-medium whitespace-nowrap">{st.name}</td>
                    {mDays.map((d) => { const a = att(st.id, d); return <td key={d} className="td !px-0.5 text-center">{a ? <span className={cn('inline-grid place-items-center size-5 rounded text-[10px] font-semibold', LCOL[a.status])}>{LETTER[a.status]}</span> : <span className="text-stone-300">·</span>}</td> })}
                    <td className="td text-center num">{x.present}</td><td className="td text-center num">{x.half}</td><td className="td text-center num">{x.leave}</td><td className="td text-center num">{x.absent}</td><td className="td text-center num">{x.late}</td><td className="td text-right num font-medium">{x.payable}</td></tr>) })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[11px] text-stone-500 flex gap-3">{STATUSES.map((k) => <span key={k}><span className={cn('inline-grid place-items-center size-4 rounded text-[9px] font-semibold mr-1', LCOL[k])}>{LETTER[k]}</span>{k}</span>)}</div>
        </Card>
      )}
      {tab === 'sal' && (
        <Card title={`Salary estimate — ${fmtMonth(mFrom)}`} subtitle="Simple estimate (not payroll): payable days = present + ½ half-days + paid leave." actions={<input type="month" className="input !w-40" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />} pad={false}>
          <table className="w-full text-[13px]">
            <thead><tr><th className="th">Staff</th><th className="th text-right">Monthly salary</th><th className="th text-right">Per day</th><th className="th text-right">Payable days</th><th className="th text-right">Absent</th><th className="th text-right">{month === today.slice(0, 7) ? 'Estimated payable (accrued to date)' : 'Estimated payable'}</th></tr></thead>
            <tbody>
              {salRows.map((r) => <tr key={r.st.id}><td className="td"><b>{r.st.name}</b><div className="text-[11px] text-stone-500">{r.st.role}</div></td><td className="td text-right num">{inr(r.st.monthlySalary)}</td><td className="td text-right num">{inr(r.perDay)}</td><td className="td text-right num">{r.payable}{month === today.slice(0, 7) && <span className="text-[11px] text-stone-400"> / {dayDiff(mFrom, today) + 1} so far</span>}</td><td className="td text-right num">{r.absent}</td><td className="td text-right num font-semibold">{inr(r.estimate)}</td></tr>)}
            </tbody>
            <tfoot><tr><td className="td font-semibold">Total</td><td className="td text-right num font-semibold">{inr(sum(salRows, (r) => r.st.monthlySalary))}</td><td /><td /><td /><td className="td text-right num font-semibold">{inr(sum(salRows, (r) => r.estimate))}</td></tr></tfoot>
          </table>
        </Card>
      )}
      {edit && <StaffForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
