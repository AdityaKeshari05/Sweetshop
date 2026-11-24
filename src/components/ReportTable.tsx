import { Download } from 'lucide-react'
import { downloadCSV, inr2 } from '../lib/util'
import type { Report } from '../lib/reports'
import { EmptyState, Notice } from './ui'
import { useMemo, useState } from 'react'

export function ReportTable({ report, filename }: { report: Report; filename: string }) {
  const [q, setQ] = useState('')
  const money = new Set(report.money || [])
  const rows = useMemo(() => (q ? report.rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(q.toLowerCase()))) : report.rows), [report, q])
  const num = (c: any) => typeof c === 'number'
  const total = (i: number) => rows.reduce((a, r) => a + (Number(r[i]) || 0), 0)
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input className="input !w-60" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-stone-500">{rows.length} rows</span>
        <button className="btn-secondary btn-sm ml-auto" disabled={!report.rows.length} onClick={() => downloadCSV(filename, report.headers, report.rows)}><Download className="size-3.5" />Export CSV</button>
      </div>
      {report.note && <div className="mb-3"><Notice tone="amber">{report.note}</Notice></div>}
      {!report.rows.length ? <EmptyState title="No data for this period" hint="Try widening the date range." /> : (
        <div className="overflow-auto rounded-lg border border-stone-200 max-h-[560px]">
          <table className="w-full border-collapse bg-white">
            <thead className="sticky top-0"><tr>{report.headers.map((h, i) => <th key={h} className={`th ${money.has(i) || num(report.rows[0]?.[i]) ? '!text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, k) => <tr key={k} className="hover:bg-stone-50">{r.map((c, i) => <td key={i} className={`td ${money.has(i) || num(c) ? 'text-right num' : ''} ${r[0] === 'Total' ? 'font-semibold' : ''}`}>{money.has(i) && num(c) ? inr2(c) : (c as any) ?? '—'}</td>)}</tr>)}
            </tbody>
            {report.money && report.money.length > 0 && rows.length > 1 && !rows.some((r) => r[0] === 'Total') && (
              <tfoot><tr>{report.headers.map((_, i) => <td key={i} className={`td font-semibold bg-stone-50 ${money.has(i) ? 'text-right num' : ''}`}>{i === 0 ? 'Total' : money.has(i) ? inr2(total(i)) : ''}</td>)}</tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
