import { useMemo, useState } from 'react'
import { ArrowLeftRight, PackagePlus, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { batchStatus, stockMap, stockValue, lowStockProducts, type StockStatus } from '../lib/calc'
import { can, go } from '../lib/perm'
import { CATEGORIES, type Batch, type Product } from '../lib/types'
import { addDays, fmtDate, fmtDT, fmtQty, inr, inr2, num, todayStr } from '../lib/util'
import { Badge, Card, confirmDialog, DataTable, Field, Modal, NumInput, PageHeader, run, Stat, StatusBadge, Tabs, type Col } from '../components/ui'

export function ProductForm({ initial, onClose }: { initial?: Product; onClose: () => void }) {
  const s = useStore()
  const [f, setF] = useState({
    name: initial?.name || '', sku: initial?.sku || '', category: initial?.category || CATEGORIES[0] as string, unit: initial?.unit || 'kg', purchasePrice: initial?.purchasePrice ?? 0, sellPrice: initial?.sellPrice ?? 0,
    gstRate: initial?.gstRate ?? 5, hsn: initial?.hsn || '2106', minStock: initial?.minStock ?? 5, supplierId: initial?.supplierId || '', shelfLife: initial?.shelfLife ?? 7, opening: 0,
  })
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))
  const save = () => {
    const { opening, ...p } = f
    const data = { ...p, purchasePrice: Number(p.purchasePrice), sellPrice: Number(p.sellPrice), gstRate: Number(p.gstRate), minStock: Number(p.minStock), shelfLife: Number(p.shelfLife), supplierId: p.supplierId || undefined } as any
    const r = initial ? run(() => act.updateProduct(initial.id, data), 'Product updated') : run(() => act.addProduct(data, Number(opening) || 0), 'Product added')
    if (r.ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : 'Add product'} size="lg" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save product</button></>}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Product name" required className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="SKU" hint="Auto-generated if blank"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Sold by (unit)"><select className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)}><option value="kg">Weight (kg / grams)</option><option value="pc">Pieces</option><option value="box">Boxes</option></select></Field>
        <Field label="Supplier"><select className="input" value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}><option value="">—</option>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label={`Purchase / cost price (₹ per ${f.unit})`}><NumInput value={f.purchasePrice} onChange={(v) => set('purchasePrice', v)} step="any" /></Field>
        <Field label={`Selling price (₹ per ${f.unit})`} required><NumInput value={f.sellPrice} onChange={(v) => set('sellPrice', v)} step="any" /></Field>
        <Field label="GST rate (%)" hint="Demo rate — verify actual classification"><select className="input" value={f.gstRate} onChange={(e) => set('gstRate', e.target.value)}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
        <Field label="HSN code"><input className="input" value={f.hsn} onChange={(e) => set('hsn', e.target.value)} /></Field>
        <Field label="Minimum stock level"><NumInput value={f.minStock} onChange={(v) => set('minStock', v)} step="any" /></Field>
        <Field label="Shelf life (days)"><NumInput value={f.shelfLife} onChange={(v) => set('shelfLife', v)} /></Field>
        {!initial && <Field label={`Opening stock (${f.unit})`} hint="Creates an opening batch" className="col-span-3"><NumInput value={f.opening} onChange={(v) => set('opening', v)} step="any" /></Field>}
      </div>
    </Modal>
  )
}

function AdjustModal({ onClose, product }: { onClose: () => void; product?: string }) {
  const s = useStore()
  const [pid, setPid] = useState(product || s.products.find((p) => !p.archived)!.id)
  const p = s.products.find((x) => x.id === pid)!
  const [mode, setMode] = useState<'add' | 'reduce'>('add')
  const [qty, setQty] = useState<number | ''>('')
  const [batchId, setBatchId] = useState('')
  const [produced, setProduced] = useState(todayStr())
  const [expiry, setExpiry] = useState('')
  const [cost, setCost] = useState<number | ''>('')
  const [reason, setReason] = useState('Fresh production')
  const batches = s.batches.filter((b) => b.productId === pid && b.qty > 0)
  const submit = () => { if (run(() => act.adjustStock({ productId: pid, mode, qty: Number(qty), batchId: batchId || batches[0]?.id, produced, expiry: expiry || addDays(produced, p.shelfLife), cost: cost === '' ? p.purchasePrice : Number(cost), reason }), 'Stock adjusted — ledger updated').ok) onClose() }
  return (
    <Modal open onClose={onClose} title="Stock adjustment" subtitle="Record in-house production, counting corrections or breakage. Every change is written to the stock ledger." size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Apply adjustment</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product" className="col-span-2"><select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>{s.products.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Adjustment type"><select className="input" value={mode} onChange={(e) => { setMode(e.target.value as any); setReason(e.target.value === 'add' ? 'Fresh production' : 'Counting correction') }}><option value="add">Add stock (new batch)</option><option value="reduce">Reduce stock (from a batch)</option></select></Field>
        <Field label={`Quantity (${p.unit})`}><NumInput value={qty} onChange={setQty} step="any" /></Field>
        {mode === 'add' ? (
          <>
            <Field label="Production date"><input type="date" className="input" value={produced} onChange={(e) => setProduced(e.target.value)} /></Field>
            <Field label="Expiry date" hint={`Defaults to ${p.shelfLife} days shelf life`}><input type="date" className="input" value={expiry || addDays(produced, p.shelfLife)} onChange={(e) => setExpiry(e.target.value)} /></Field>
            <Field label={`Cost per ${p.unit} (₹)`}><NumInput value={cost === '' ? p.purchasePrice : cost} onChange={setCost} step="any" /></Field>
          </>
        ) : (
          <Field label="Batch" className="col-span-2"><select className="input" value={batchId || batches[0]?.id || ''} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo} · {fmtQty(b.qty, p.unit)} · exp {fmtDate(b.expiry)} · {s.locations.find((l) => l.id === b.locationId)?.name}</option>)}</select></Field>
        )}
        <Field label="Reason" className="col-span-2" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function TransferModal({ onClose, batch }: { onClose: () => void; batch?: Batch }) {
  const s = useStore()
  const all = s.batches.filter((b) => b.qty > 0)
  const [bid, setBid] = useState(batch?.id || all[0]?.id)
  const b = all.find((x) => x.id === bid)
  const [qty, setQty] = useState<number | ''>('')
  const [to, setTo] = useState(s.locations.find((l) => l.id !== b?.locationId)?.id || 'godown')
  const p = b && s.products.find((x) => x.id === b.productId)
  return (
    <Modal open onClose={onClose} title="Stock transfer between locations" subtitle="The data model supports multiple locations — this shop has a main outlet and a cold-storage godown." size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => run(() => act.transfer({ batchId: bid!, qty: Number(qty), toLocation: to }), 'Stock transferred') .ok && onClose()}>Transfer</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Batch" className="col-span-2"><select className="input" value={bid} onChange={(e) => setBid(e.target.value)}>{all.map((x) => <option key={x.id} value={x.id}>{s.products.find((pp) => pp.id === x.productId)?.name} · {x.batchNo} · {fmtQty(x.qty, s.products.find((pp) => pp.id === x.productId)!.unit)} @ {s.locations.find((l) => l.id === x.locationId)?.name}</option>)}</select></Field>
        <Field label={`Quantity (${p?.unit})`}><NumInput value={qty} onChange={setQty} step="any" /></Field>
        <Field label="Destination"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{s.locations.filter((l) => l.id !== b?.locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      </div>
    </Modal>
  )
}

export default function Inventory({ q }: { q: string }) {
  const s = useStore()
  const role = currentUser(s).role
  const sm = stockMap(s)
  const [tab, setTab] = useState<'products' | 'batches' | 'ledger'>('products')
  const [cat, setCat] = useState('all')
  const [stat, setStat] = useState('all')
  const [edit, setEdit] = useState<Product | 'new' | null>(null)
  const [adj, setAdj] = useState<string | null | undefined>(undefined)
  const [tr, setTr] = useState<Batch | 'any' | null>(null)
  const [lp, setLp] = useState('all')
  const [lt, setLt] = useState('all')
  const products = s.products.filter((p) => !p.archived)
  const rows = products.filter((p) => (cat === 'all' || p.category === cat) && (stat === 'all' || sm[p.id].status === stat))
  const canEdit = can(role, 'editProduct')
  const canCost = can(role, 'costPrice')
  const cols: Col<Product>[] = [
    { key: 'name', header: 'Product', render: (p) => <div><div className="font-medium">{p.name}</div><div className="text-[11px] text-stone-500">{p.category}</div></div>, value: (p) => p.name },
    { key: 'sku', header: 'SKU' },
    { key: 'stock', header: 'Available stock', align: 'right', value: (p) => sm[p.id].sellable, render: (p) => <div><b>{num(sm[p.id].sellable, 3)}</b>{sm[p.id].expired > 0 && <div className="text-[11px] text-red-600">+{num(sm[p.id].expired, 3)} expired</div>}{sm[p.id].other > 0 && <div className="text-[11px] text-stone-500">+{num(sm[p.id].other, 3)} in godown</div>}</div> },
    { key: 'unit', header: 'Unit', render: (p) => <span className="text-stone-600">{p.unit === 'kg' ? 'kg' : p.unit === 'pc' ? 'piece' : 'box'}</span> },
    { key: 'pp', header: 'Purchase price', align: 'right', value: (p) => p.purchasePrice, render: (p) => (canCost ? inr(p.purchasePrice) : '•••') },
    { key: 'sp', header: 'Selling price', align: 'right', value: (p) => p.sellPrice, render: (p) => inr(p.sellPrice) },
    { key: 'min', header: 'Min', align: 'right', value: (p) => p.minStock },
    { key: 'val', header: 'Stock value', align: 'right', value: (p) => Math.round(sm[p.id].value + sm[p.id].expiredValue), render: (p) => (canCost ? inr(sm[p.id].value + sm[p.id].expiredValue) : '•••') },
    { key: 'status', header: 'Status', value: (p) => sm[p.id].status, render: (p) => <StatusBadge s={sm[p.id].status} /> },
    {
      key: 'act', header: '', noSort: true, noCsv: true, render: (p) => (
        <div className="flex gap-1 justify-end">
          <button className="btn-ghost btn-sm btn-icon" title="Adjust stock" disabled={!can(role, 'adjustStock')} onClick={() => setAdj(p.id)}><PackagePlus className="size-4" /></button>
          <button className="btn-ghost btn-sm btn-icon" title="Edit" disabled={!canEdit} onClick={() => setEdit(p)}><Pencil className="size-4" /></button>
          <button className="btn-ghost btn-sm btn-icon text-red-600" title="Delete" disabled={!can(role, 'deleteProduct')} onClick={async () => { if (await confirmDialog({ title: `Delete ${p.name}?`, message: 'The product is removed from POS and inventory. Historic invoices keep their records.', danger: true, confirmLabel: 'Delete' })) run(() => act.deleteProduct(p.id), 'Product deleted') }}><Trash2 className="size-4" /></button>
        </div>
      ),
    },
  ]
  const pname = (id: string) => s.products.find((p) => p.id === id)?.name || '—'
  const bcols: Col<Batch>[] = [
    { key: 'p', header: 'Product', value: (b) => pname(b.productId) }, { key: 'batchNo', header: 'Batch no.' }, { key: 'loc', header: 'Location', value: (b) => s.locations.find((l) => l.id === b.locationId)?.name },
    { key: 'produced', header: 'Produced', render: (b) => fmtDate(b.produced), value: (b) => b.produced }, { key: 'received', header: 'Received', render: (b) => fmtDate(b.received), value: (b) => b.received },
    { key: 'expiry', header: 'Expiry', render: (b) => fmtDate(b.expiry), value: (b) => b.expiry },
    { key: 'qty', header: 'Qty', align: 'right', value: (b) => b.qty, render: (b) => fmtQty(b.qty, s.products.find((p) => p.id === b.productId)?.unit || 'kg') },
    { key: 'cost', header: 'Cost / unit', align: 'right', value: (b) => b.cost, render: (b) => (canCost ? inr(b.cost) : '•••') },
    { key: 'st', header: 'Status', value: (b) => batchStatus(b, todayStr(), s.products.find((p) => p.id === b.productId)?.shelfLife), render: (b) => <StatusBadge s={batchStatus(b, todayStr(), s.products.find((p) => p.id === b.productId)?.shelfLife)} /> },
    { key: 'a', header: '', noSort: true, noCsv: true, render: (b) => <button className="btn-ghost btn-sm" disabled={!can(role, 'adjustStock') || b.qty <= 0} onClick={() => setTr(b)}><ArrowLeftRight className="size-3.5" />Transfer</button> },
  ]
  const ledger = useMemo(() => [...s.ledger].filter((l) => (lp === 'all' || l.productId === lp) && (lt === 'all' || l.type === lt)).sort((a, b) => b.at.localeCompare(a.at)), [s.ledger, lp, lt])
  const batches = s.batches.filter((b) => b.qty > 0 || b.expiry >= addDays(todayStr(), -3)).sort((a, b) => a.expiry.localeCompare(b.expiry))
  const low = lowStockProducts(s)

  return (
    <div>
      <PageHeader title="Inventory & Stock" subtitle="Product master, batch-level stock, valuation and the full stock ledger. Sales deduct stock automatically (FEFO)."
        actions={<>
          <button className="btn-secondary" onClick={() => go('suppliers')}><Truck className="size-4" />Goods received</button>
          <button className="btn-secondary" disabled={!can(role, 'adjustStock')} onClick={() => setTr('any')}><ArrowLeftRight className="size-4" />Transfer</button>
          <button className="btn-secondary" disabled={!can(role, 'adjustStock')} onClick={() => setAdj(null)}><PackagePlus className="size-4" />Adjust stock</button>
          <button className="btn-primary" disabled={!canEdit} onClick={() => setEdit('new')}><Plus className="size-4" />Add product</button></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Active SKUs" value={products.length} /><Stat label="Stock value (at cost)" value={canCost ? inr(stockValue(s)) : '•••'} tone="green" /><Stat label="Low stock" value={low.length} tone="amber" onClick={() => setStat('Low stock')} />
        <Stat label="Out of stock" value={products.filter((p) => sm[p.id].status === 'Out of stock').length} tone="red" onClick={() => setStat('Out of stock')} /><Stat label="With expired stock" value={products.filter((p) => sm[p.id].expired > 0).length} tone="red" onClick={() => setStat('Expired')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'products', label: 'Product master' }, { id: 'batches', label: 'Batches' }, { id: 'ledger', label: 'Stock ledger' }]} />
      {tab === 'products' && (
        <Card><DataTable columns={cols} rows={rows} rowKey={(p) => p.id} defaultSearch={q} exportName="inventory" pageSize={15} searchPlaceholder="Search product or SKU…"
          toolbar={<><select className="input !w-44" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="input !w-40" value={stat} onChange={(e) => setStat(e.target.value as StockStatus | 'all')}><option value="all">All statuses</option>{['In stock', 'Low stock', 'Out of stock', 'Expiring soon', 'Expired'].map((c) => <option key={c}>{c}</option>)}</select></>} /></Card>
      )}
      {tab === 'batches' && <Card><DataTable columns={bcols} rows={batches} rowKey={(b) => b.id} exportName="batches" pageSize={15} /></Card>}
      {tab === 'ledger' && (
        <Card><DataTable rowKey={(l) => l.id} exportName="stock-ledger" pageSize={15} rows={ledger} initialSort={undefined}
          toolbar={<><select className="input !w-48" value={lp} onChange={(e) => setLp(e.target.value)}><option value="all">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select className="input !w-40" value={lt} onChange={(e) => setLt(e.target.value)}><option value="all">All movements</option>{['purchase', 'opening', 'sale', 'refund-in', 'cancel-in', 'wastage', 'adjust-in', 'adjust-out', 'transfer-in', 'transfer-out', 'order-reserve', 'order-release'].map((t) => <option key={t}>{t}</option>)}</select></>}
          columns={[
            { key: 'at', header: 'Date & time', render: (l) => fmtDT(l.at), value: (l) => l.at }, { key: 'p', header: 'Product', value: (l) => pname(l.productId) }, { key: 'b', header: 'Batch', value: (l) => l.batchNo || '—' },
            { key: 'type', header: 'Movement', render: (l) => <Badge tone={l.qty > 0 ? 'green' : 'red'}>{l.type}</Badge> },
            { key: 'qty', header: 'Qty', align: 'right', value: (l) => l.qty, render: (l) => <b className={l.qty > 0 ? 'text-emerald-700' : 'text-red-600'}>{l.qty > 0 ? '+' : ''}{num(l.qty, 3)}</b> },
            { key: 'ref', header: 'Reference', value: (l) => l.ref || '' }, { key: 'note', header: 'Note', value: (l) => l.note || '' }, { key: 'loc', header: 'Location', value: (l) => s.locations.find((x) => x.id === l.locationId)?.name }, { key: 'by', header: 'By', value: (l) => l.by || '' },
          ]} /></Card>
      )}
      {edit && <ProductForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {adj !== undefined && <AdjustModal product={adj || undefined} onClose={() => setAdj(undefined)} />}
      {tr && <TransferModal batch={tr === 'any' ? undefined : tr} onClose={() => setTr(null)} />}
    </div>
  )
}
