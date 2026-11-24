import { useMemo, useState } from 'react'
import { FileBarChart } from 'lucide-react'
import { useStore, currentUser } from '../lib/store'
import { REPORTS, buildReport } from '../lib/reports'
import { cn, fmtDate } from '../lib/util'
import { Card, PageHeader, RangePicker, rangeFor, type DateRange } from '../components/ui'
import { ReportTable } from '../components/ReportTable'

export default function Reports() {
  const s = useStore()
  const role = currentUser(s).role
  const [id, setId] = useState('daily-sales')
  const [range, setRange] = useState<DateRange>(rangeFor('month'))
  const defs = REPORTS.filter((r) => !r.roles || r.roles.includes(role))
  const cur = defs.find((r) => r.id === id) || defs[0]
  const report = useMemo(() => buildReport(cur.id, s, range.from, range.to), [cur.id, s, range.from, range.to])
  const groups = defs.reduce<Record<string, typeof defs>>((a, r) => ((a[r.group] ||= []).push(r), a), {})
  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Choose a report, set the date range and export to CSV." actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid lg:grid-cols-[250px_1fr] gap-4">
        <Card pad={false} className="h-fit">
          <nav className="p-2">
            {Object.entries(groups).map(([g, items]) => (
              <div key={g} className="mb-2">
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{g}</div>
                {items.map((r) => <button key={r.id} onClick={() => setId(r.id)} className={cn('w-full text-left px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer', cur.id === r.id ? 'bg-brand-50 text-brand-800 font-medium' : 'text-stone-600 hover:bg-stone-50')}>{r.label}</button>)}
              </div>
            ))}
            {role !== 'Owner' && <p className="px-2.5 py-2 text-[11px] text-stone-400">Profit & loss reports are limited to the Owner/Admin role.</p>}
          </nav>
        </Card>
        <Card title={<span className="flex items-center gap-2"><FileBarChart className="size-4 text-brand-700" />{report.title}</span>} subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`}>
          <ReportTable report={report} filename={`${cur.id}_${range.from}_${range.to}`} />
        </Card>
      </div>
    </div>
  )
}
