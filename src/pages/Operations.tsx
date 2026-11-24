import { useState } from 'react'
import { CheckCircle2, Circle, Lock, LockOpen, Printer, Sun, Moon, RotateCcw } from 'lucide-react'
import { useStore, act, actions } from '../lib/store'
import { cashRegister, lowStockProducts, periodSummary, stockMap, batchStatus } from '../lib/calc'
import { go } from '../lib/perm'
import { cn, fmtDate, fmtTime, inr, inr2, nowTimeStr, todayStr } from '../lib/util'
import type { DayRecord } from '../lib/types'
import { Badge, Card, DataTable, Field, Modal, NumInput, Notice, PageHeader, PrintArea, run, Stat, confirmDialog, type Col } from '../components/ui'

export function DaySummary({ day }: { day: DayRecord }) {
  const s = useStore()
  const sm = day.summary
  const diff = day.diff ?? 0
  return (
    <div className="bg-white text-[12.5px] text-stone-900 max-w-[720px] mx-auto">
      <div className="text-center border-b-2 border-stone-800 pb-2 mb-3">
        <div className="text-lg font-bold">{s.settings.businessName}</div>
        <div className="text-stone-600">Daily closing summary — {fmtDate(day.date)}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        {[
          ['Opened', `${fmtTime(day.openedAt)} by ${day.openedBy || '—'}`], ['Closed', `${fmtTime(day.closedAt)} by ${day.closedBy || '—'}`],
          ['Bills', sm?.bills], ['Total sales (incl. GST)', inr2(sm?.sales || 0)], ['Cash collected', inr2(sm?.cash || 0)], ['UPI collected', inr2(sm?.upi || 0)], ['Card collected', inr2(sm?.card || 0)],
          ['Refunds', inr2(sm?.refunds || 0)], ['Discounts given', inr2(sm?.discounts || 0)], ['Wastage (cost)', inr2(sm?.wastage || 0)],
          ['Opening cash', inr2(day.openingCash)], ['Expected cash', inr2(day.expectedCash || 0)], ['Actual cash counted', inr2(day.actualCash || 0)],
          [diff < 0 ? 'Cash SHORTAGE' : diff > 0 ? 'Cash EXCESS' : 'Cash difference', inr2(Math.abs(diff))], ['Gross profit (est.)', inr2(sm?.grossProfit || 0)], ['Net operating profit (est.)', inr2(sm?.netProfit || 0)],
        ].map(([k, v]) => <div key={k as string} className="flex justify-between border-b border-stone-200 py-1"><span className="text-stone-600">{k}</span><b className="num">{v}</b></div>)}
      </div>
      {day.closeNotes && <p className="mt-3"><b>Notes:</b> {day.closeNotes}</p>}
      <p className="mt-4 text-[10.5px] text-stone-500">Profit figures are demonstration estimates (GST excluded from revenue; daily allocation of salaries & rent).</p>
    </div>
  )
}

export default function Operations() {
  const s = useStore()
  const today = todayStr()
  const rec = s.days.find((d) => d.date === today)
  const isOpen = !!rec?.openedAt && !rec.closedAt
  const isClosed = !!rec?.closedAt
  const [time, setTime] = useState(nowTimeStr() < s.settings.openTime ? s.settings.openTime : nowTimeStr())
  const [cash, setCash] = useState<number | ''>(5000)
  const [notes, setNotes] = useState('')
  const [chk, setChk] = useState<Record<string, boolean>>({})
  const [closeTime, setCloseTime] = useState(nowTimeStr() > s.settings.closeTime ? nowTimeStr() : s.settings.closeTime)
  const [actual, setActual] = useState<number | ''>('')
  const [cNotes, setCNotes] = useState('')
  const [view, setView] = useState<DayRecord | null>(null)

  const sm = stockMap(s)
  const low = lowStockProducts(s)
  const expiredBatches = s.batches.filter((b) => b.qty > 0 && b.locationId === 'main' && b.expiry < today).length
  const expToday = s.batches.filter((b) => b.qty > 0 && b.expiry === today).length
  const dueToday = s.orders.filter((o) => o.dueDate === today && !['Delivered', 'Cancelled'].includes(o.status)).length
  const pendingAccept = s.orders.filter((o) => o.acceptance === 'Pending').length
  const att = s.attendance.filter((a) => a.date === today)
  const present = att.filter((a) => a.status === 'Present' || a.status === 'Half-day').length

  const checklist = [
    { id: 'stock', title: 'Verify available stock', info: `${low.length} products at/below minimum · ${expiredBatches} expired batches in stock`, page: 'inventory' },
    { id: 'orders', title: 'Review pending customer orders', info: `${dueToday} orders due today · ${pendingAccept} online orders awaiting acceptance`, page: 'orders' },
    { id: 'attendance', title: "Check today's staff attendance", info: `${present} of ${s.staff.filter((x) => x.active).length} staff present / marked`, page: 'staff' },
    { id: 'expiry', title: 'Review products expiring today', info: `${expToday} batches expire today`, page: 'expiry' },
  ]
  const reg = cashRegister(s, today)
  const sum_ = periodSummary(s, today, today)
  const counted = Number(actual)
  const diff = actual === '' ? 0 : counted - reg.expected

  const open = () => { if (run(() => act.openShop({ time, openingCash: Number(cash), notes, checklist: chk }), 'Shop opened — have a profitable day!').ok) setNotes('') }
  const close = async () => {
    if (actual === '') return run(() => { throw new Error('Enter the counted cash balance first') })
    if (Math.abs(diff) > 0.5 && !(await confirmDialog({ title: `Close with a cash ${diff < 0 ? 'shortage' : 'excess'} of ${inr(Math.abs(diff))}?`, message: 'The difference will be recorded in the daily closing summary.', confirmLabel: 'Close shop' }))) return
    run(() => act.closeShop({ time: closeTime, actualCash: counted, notes: cNotes }), 'Shop closed — daily summary generated')
  }

  const history = [...s.days].sort((a, b) => b.date.localeCompare(a.date))
  const cols: Col<DayRecord>[] = [
    { key: 'date', header: 'Date', render: (d) => fmtDate(d.date), value: (d) => d.date },
    { key: 'op', header: 'Opened', value: (d) => fmtTime(d.openedAt) }, { key: 'cl', header: 'Closed', value: (d) => fmtTime(d.closedAt) },
    { key: 'sales', header: 'Sales', align: 'right', value: (d) => d.summary?.sales ?? 0, render: (d) => (d.summary ? inr(d.summary.sales) : '—') },
    { key: 'oc', header: 'Opening cash', align: 'right', value: (d) => d.openingCash, render: (d) => inr(d.openingCash) },
    { key: 'ex', header: 'Expected', align: 'right', value: (d) => d.expectedCash ?? '', render: (d) => (d.expectedCash != null ? inr(d.expectedCash) : '—') },
    { key: 'ac', header: 'Actual', align: 'right', value: (d) => d.actualCash ?? '', render: (d) => (d.actualCash != null ? inr(d.actualCash) : '—') },
    { key: 'diff', header: 'Difference', align: 'right', value: (d) => d.diff ?? '', render: (d) => (d.diff == null ? '—' : <span className={cn('font-medium', d.diff < 0 ? 'text-red-600' : d.diff > 0 ? 'text-amber-700' : 'text-emerald-700')}>{d.diff === 0 ? 'Tallied' : (d.diff > 0 ? '+' : '') + inr(d.diff)}</span>) },
    { key: 'st', header: 'Status', value: (d) => (d.closedAt ? 'Closed' : 'Open'), render: (d) => <Badge tone={d.closedAt ? 'gray' : 'green'}>{d.closedAt ? 'Closed' : 'Open'}</Badge> },
    { key: 'v', header: '', noSort: true, noCsv: true, render: (d) => d.closedAt && <button className="btn-ghost btn-sm">Summary</button> },
  ]

  return (
    <div>
      <PageHeader title="Shop Operations" subtitle={`Daily opening and closing · standard hours ${fmtTime(s.settings.openTime)} – ${fmtTime(s.settings.closeTime)}`}
        actions={<><Badge tone={isClosed ? 'gray' : isOpen ? 'green' : 'amber'}>{isClosed ? `Closed at ${fmtTime(rec!.closedAt)}` : isOpen ? `Open since ${fmtTime(rec!.openedAt)}` : 'Not opened yet'}</Badge>
          {isClosed && <button className="btn-secondary" onClick={async () => { if (await confirmDialog({ title: 'Reopen today?', message: 'Clears the closing record so sales can continue and the day can be closed again.' })) run(() => act.reopenShop(), 'Shop reopened') }}><RotateCcw className="size-4" />Reopen</button>}</>} />

      <div className="grid xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          {!rec?.openedAt && (
            <Card title={<span className="flex items-center gap-2"><Sun className="size-4 text-saffron-600" />Opening checklist — {fmtTime(s.settings.openTime)}</span>} subtitle="Complete the checks, record the opening float, then open the shop.">
              <ul className="space-y-2 mb-4">
                {checklist.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg border border-stone-200 p-3">
                    <button onClick={() => setChk({ ...chk, [c.id]: !chk[c.id] })} className="cursor-pointer">{chk[c.id] ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5 text-stone-300" />}</button>
                    <div className="flex-1"><div className="text-[13px] font-medium">{c.title}</div><div className="text-xs text-stone-500">{c.info}</div></div>
                    <button className="btn-secondary btn-sm" onClick={() => go(c.page)}>Review</button>
                  </li>
                ))}
              </ul>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Opening time"><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
                <Field label="Opening cash balance (₹)"><NumInput value={cash} onChange={setCash} /></Field>
                <Field label="Opening notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Fresh batches received" /></Field>
              </div>
              <button className="btn-primary mt-4" onClick={open}><LockOpen className="size-4" />Open shop</button>
            </Card>
          )}
          {rec?.openedAt && (
            <Card title={<span className="flex items-center gap-2"><Sun className="size-4 text-saffron-600" />Opening record</span>}>
              <div className="grid sm:grid-cols-4 gap-3 text-[13px]">
                <div><div className="label">Opened at</div><b>{fmtTime(rec.openedAt)}</b> by {rec.openedBy}</div><div><div className="label">Opening cash</div><b className="num">{inr2(rec.openingCash)}</b></div>
                <div className="sm:col-span-2"><div className="label">Checklist</div>{checklist.map((c) => <Badge key={c.id} tone={rec.checklist?.[c.id] ? 'green' : 'gray'} className="mr-1 mb-1">{rec.checklist?.[c.id] ? '✓' : '○'} {c.title.split(' ').slice(0, 2).join(' ')}</Badge>)}</div>
                {rec.openNotes && <div className="sm:col-span-4"><div className="label">Notes</div>{rec.openNotes}</div>}
              </div>
            </Card>
          )}

          {isOpen && (
            <Card title={<span className="flex items-center gap-2"><Moon className="size-4 text-brand-700" />Closing process — {fmtTime(s.settings.closeTime)}</span>} subtitle="Figures update live from today's sales, payments, expenses and wastage.">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Total sales" value={inr(sum_.billed)} sub={`${sum_.bills} bills`} /><Stat label="UPI payments" value={inr(sum_.upi)} tone="brand" /><Stat label="Card payments" value={inr(sum_.card)} tone="amber" /><Stat label="Cash collected" value={inr(sum_.cash)} tone="green" />
                <Stat label="Refunds" value={inr(sum_.refundsBilled)} tone="red" /><Stat label="Discounts" value={inr(sum_.discountsBilled)} tone="amber" /><Stat label="Wastage" value={inr(sum_.wastage)} tone="red" /><Stat label="Expenses (cash)" value={inr(reg.paidOut)} tone="gray" />
              </div>
              <div className="rounded-xl border border-stone-200 overflow-hidden mb-4">
                <div className="px-4 py-2 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">Expected cash in drawer</div>
                <div className="px-4 py-3 text-[13px] space-y-1">
                  <div className="flex justify-between"><span>Opening cash</span><span className="num">{inr2(reg.opening)}</span></div>
                  <div className="flex justify-between text-emerald-700"><span>+ Cash received (sales, advances, dues)</span><span className="num">{inr2(reg.received)}</span></div>
                  <div className="flex justify-between text-red-600"><span>− Cash refunds, expenses & supplier payments</span><span className="num">{inr2(reg.paidOut)}</span></div>
                  <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold text-sm"><span>Expected cash balance</span><span className="num">{inr2(reg.expected)}</span></div>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Closing time"><input type="time" className="input" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} /></Field>
                <Field label="Actual cash counted (₹)"><NumInput value={actual} onChange={setActual} /></Field>
                <div className="flex items-end"><div className={cn('w-full rounded-lg px-3 h-9 flex items-center justify-between text-[13px] font-medium', actual === '' ? 'bg-stone-100 text-stone-500' : Math.abs(diff) < 0.5 ? 'bg-emerald-50 text-emerald-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}><span>{actual === '' ? 'Difference' : Math.abs(diff) < 0.5 ? 'Cash tallies' : diff < 0 ? 'Shortage' : 'Excess'}</span><span className="num">{actual === '' ? '—' : inr(Math.abs(diff))}</span></div></div>
                <Field label="Closing notes" className="sm:col-span-3"><input className="input" value={cNotes} onChange={(e) => setCNotes(e.target.value)} placeholder="e.g. Cash deposited in bank, float retained ₹5,000" /></Field>
              </div>
              <button className="btn-primary mt-4" onClick={close}><Lock className="size-4" />Close shop & generate summary</button>
            </Card>
          )}
          {isClosed && rec && (
            <Card title="Today's closing summary" actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}><Printer className="size-3.5" />Print</button>}>
              <DaySummary day={rec} /><PrintArea><DaySummary day={rec} /></PrintArea>
            </Card>
          )}
          {!rec?.openedAt && <Notice tone="blue">Tip: POS billing remains available even if the shop hasn’t been opened, but cash reconciliation needs the opening float.</Notice>}
        </div>
        <div className="space-y-4">
          <Card title="Shop hours (configurable)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening time"><input type="time" className="input" value={s.settings.openTime} onChange={(e) => actions.updateSettings({ openTime: e.target.value })} /></Field>
              <Field label="Closing time"><input type="time" className="input" value={s.settings.closeTime} onChange={(e) => actions.updateSettings({ closeTime: e.target.value })} /></Field>
            </div>
            <p className="text-[11px] text-stone-500 mt-2">Used for lateness checks, defaults and the dashboard clock.</p>
          </Card>
          <Card title="Today's cash movements" pad={false}>
            <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
              {reg.entries.slice(-14).reverse().map((e, i) => <li key={i} className="px-4 py-2 text-[12.5px] flex justify-between gap-3"><span className="truncate">{e.label}</span><b className={cn('num', e.amount < 0 ? 'text-red-600' : 'text-emerald-700')}>{e.amount < 0 ? '−' : '+'}{inr(Math.abs(e.amount))}</b></li>)}
              {!reg.entries.length && <li className="px-4 py-6 text-center text-xs text-stone-500">No cash movements yet</li>}
            </ul>
          </Card>
        </div>
      </div>
      <div className="mt-6"><h2 className="text-sm font-semibold mb-2">Opening & closing history</h2>
        <Card><DataTable columns={cols} rows={history} rowKey={(d) => d.date} searchable={false} pageSize={8} exportName="shop-operations-history" onRowClick={(d) => d.closedAt && setView(d)} /></Card></div>
      {view && <Modal open onClose={() => setView(null)} title="Daily closing summary" size="lg" footer={<><button className="btn-secondary" onClick={() => setView(null)}>Close</button><button className="btn-primary" onClick={() => window.print()}><Printer className="size-4" />Print</button></>}><DaySummary day={view} /><PrintArea><DaySummary day={view} /></PrintArea></Modal>}
    </div>
  )
}
