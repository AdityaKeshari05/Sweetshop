import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Minus, Plus, Printer, QrCode, Search, ShoppingBag, Trash2, Wallet, X, Banknote, Split } from 'lucide-react'
import { useStore, act, currentUser } from '../lib/store'
import { computeBill, stockMap, supplyFor, customerOutstanding } from '../lib/calc'
import { CATEGORIES, type PayMode, type Product, type Sale } from '../lib/types'
import { bus } from '../lib/bus'
import { cn, fmtQty, inr, inr2, r2, r3, todayStr } from '../lib/util'
import { Badge, Field, Modal, NumInput, Notice, Segmented, run, toast } from '../components/ui'
import { CustomerPicker } from '../components/CustomerPicker'
import { InvoiceModal } from '../components/Invoice'
import { go } from '../lib/perm'
import { UPI_PROVIDERS } from '../lib/ops'

const CAT_COLOR: Record<string, string> = {
  'Milk Sweets': 'bg-sky-500', 'Bengali Sweets': 'bg-emerald-500', 'Dry Fruit Sweets': 'bg-amber-500', 'Traditional Sweets': 'bg-orange-500', Snacks: 'bg-rose-500', Namkeen: 'bg-yellow-600', 'Gift Boxes': 'bg-violet-500',
}
const defaultQty = (p: Product) => (p.unit === 'kg' ? 0.5 : 1)

interface Line { productId: string; qty: number }
interface PayRow { mode: PayMode; amount: number; ref: string; provider: string; tendered?: number }

function FakeQR({ seed }: { seed: number }) {
  const cells = useMemo(() => {
    let x = seed || 7
    const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296)
    return Array.from({ length: 21 * 21 }, (_, i) => {
      const r = Math.floor(i / 21), c = i % 21
      const finder = (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7)
      if (finder) { const rr = r % 14 > 6 ? r - 14 : r, cc = c > 13 ? c - 14 : c; return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) }
      return rnd() > 0.52
    })
  }, [seed])
  return (
    <svg viewBox="0 0 21 21" className="size-28 rounded bg-white p-1.5 border border-stone-200" shapeRendering="crispEdges">
      {cells.map((on, i) => on && <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" fill="#1c1917" />)}
    </svg>
  )
}

function Checkout({ total, customerId, onClose, onPay, pref }: { total: number; customerId?: string; onClose: () => void; onPay: (rows: PayRow[]) => void; pref: PayMode | 'Credit' }) {
  const s = useStore()
  const mk = (mode: PayMode, amount: number): PayRow => ({ mode, amount, ref: '', provider: UPI_PROVIDERS[0] })
  const [rows, setRows] = useState<PayRow[]>(pref === 'Credit' ? [] : [mk(pref, total)])
  const paid = r2(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0))
  const rest = r2(total - paid)
  const upi = rows.find((r) => r.mode === 'UPI')
  const cust = s.customers.find((c) => c.id === customerId)
  const set = (i: number, p: Partial<PayRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const quick = (m: PayMode | 'Credit' | 'Split') => {
    if (m === 'Credit') setRows([])
    else if (m === 'Split') { const c = Math.round(total / 2 / 10) * 10; setRows([mk('Cash', c), mk('UPI', r2(total - c))]) }
    else setRows([mk(m, total)])
  }
  return (
    <Modal open onClose={onClose} title="Collect payment" subtitle="Payments are simulated — no live payment gateway is connected." size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Back</button>
          <button className="btn-accent" disabled={rest < -0.5 || (rest > 0.5 && !cust)} onClick={() => onPay(rows.filter((r) => Number(r.amount) > 0))}>Complete sale · {inr(total)}</button>
        </>
      }>
      <div className="grid md:grid-cols-[1fr_220px] gap-5">
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {([['Cash', Banknote], ['UPI', QrCode], ['Card', CreditCard], ['Split', Split], ['Credit', Wallet]] as const).map(([m, Icon]) => (
              <button key={m} className="btn-secondary" onClick={() => quick(m as any)}><Icon className="size-4" />{m === 'Credit' ? 'On credit' : m === 'Split' ? 'Split' : m}</button>
            ))}
          </div>
          <div className="space-y-2.5">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-stone-200 p-3 bg-stone-50/60">
                <div className="grid grid-cols-[110px_1fr_auto] gap-2 items-end">
                  <Field label="Mode"><select className="input" value={r.mode} onChange={(e) => set(i, { mode: e.target.value as PayMode })}><option>Cash</option><option>UPI</option><option>Card</option></select></Field>
                  <Field label="Amount (₹)"><NumInput value={r.amount} onChange={(v) => set(i, { amount: v })} step="any" /></Field>
                  <button className="btn-ghost btn-icon mb-0.5" onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>
                </div>
                {r.mode === 'UPI' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Field label="UPI provider"><select className="input" value={r.provider} onChange={(e) => set(i, { provider: e.target.value })}>{UPI_PROVIDERS.map((p) => <option key={p}>{p}</option>)}</select></Field>
                    <Field label="UPI txn reference" hint="Auto-generated (simulated) if blank"><input className="input" value={r.ref} placeholder="e.g. 4128 3391 0275" onChange={(e) => set(i, { ref: e.target.value })} /></Field>
                  </div>
                )}
                {r.mode === 'Card' && <Field label="Approval / last 4 digits" className="mt-2"><input className="input" value={r.ref} placeholder="Auto if blank" onChange={(e) => set(i, { ref: e.target.value })} /></Field>}
                {r.mode === 'Cash' && (
                  <div className="grid grid-cols-2 gap-2 mt-2 items-end">
                    <Field label="Cash tendered (optional)"><NumInput value={r.tendered ?? ''} onChange={(v) => set(i, { tendered: v })} /></Field>
                    <div className="text-sm pb-2">{r.tendered && r.tendered > r.amount ? <>Change to return: <b className="text-emerald-700">{inr(r.tendered - r.amount)}</b></> : <span className="text-stone-400">Change calculator</span>}</div>
                  </div>
                )}
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => setRows([...rows, mk('Cash', Math.max(0, rest))])}><Plus className="size-3.5" />Add payment row</button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-brand-900 text-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-brand-200">Amount payable</div>
            <div className="text-3xl font-semibold num mt-1">{inr2(total)}</div>
            <div className="mt-3 pt-3 border-t border-white/15 text-xs space-y-1">
              <div className="flex justify-between"><span>Received</span><span className="num">{inr2(paid)}</span></div>
              <div className={cn('flex justify-between font-semibold', rest > 0.5 ? 'text-saffron-400' : rest < -0.5 ? 'text-red-300' : 'text-emerald-300')}><span>{rest < -0.5 ? 'Over-collected' : rest > 0.5 ? 'On credit' : 'Balanced'}</span><span className="num">{inr2(Math.abs(rest))}</span></div>
            </div>
          </div>
          {rest > 0.5 && !cust && <Notice tone="red">Select a registered customer on the bill to sell the balance on credit.</Notice>}
          {rest > 0.5 && cust && <Notice tone="blue">{inr(rest)} will be added to {cust.name}’s outstanding balance.</Notice>}
          {upi && (
            <div className="rounded-xl border border-stone-200 p-3 text-center">
              <FakeQR seed={Math.round(total * 7)} />
              <div className="text-[11px] text-stone-500 mt-1.5">Scan to pay {inr(upi.amount)} · <b>{s.settings.upiId}</b></div>
              <Badge tone="amber" className="mt-1.5">Simulated UPI QR</Badge>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function POS() {
  const s = useStore()
  const user = currentUser(s)
  const sm = stockMap(s)
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<Line[]>([])
  const [customerId, setCustomerId] = useState<string | undefined>()
  const [dtype, setDtype] = useState<'amt' | 'pct'>('pct')
  const [dval, setDval] = useState<number | ''>('')
  const [supplyMode, setSupplyMode] = useState<'auto' | 'intra' | 'inter'>('auto')
  const [checkout, setCheckout] = useState<null | PayMode | 'Credit'>(null)
  const [done, setDone] = useState<Sale | null>(null)
  const [pref, setPref] = useState<PayMode | 'Credit'>('Cash')

  useEffect(() => {
    const pr = bus.posPreset
    if (!pr) return
    bus.posPreset = null
    const lines: Line[] = []
    for (const it of pr.items) { const p = s.products.find((x) => x.name === it.name); if (p) lines.push({ productId: p.id, qty: it.qty }) }
    setCart(lines)
    if (pr.pay) setPref(pr.pay)
    toast.info('Scenario loaded: review the cart, then press “Charge”.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const products = useMemo(() => {
    const t = q.trim().toLowerCase()
    return s.products.filter((p) => !p.archived && (cat === 'All' || p.category === cat) && (!t || p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)))
  }, [s.products, cat, q])

  const cust = s.customers.find((c) => c.id === customerId)
  const supply = supplyMode === 'auto' ? supplyFor(s.settings.state, cust?.state) : supplyMode
  const items = cart.map((l) => { const p = s.products.find((x) => x.id === l.productId)!; return { productId: p.id, name: p.name, unit: p.unit, hsn: p.hsn, gstRate: p.gstRate, qty: l.qty, rate: p.sellPrice } })
  const subtotal = r2(items.reduce((a, i) => a + i.qty * i.rate, 0))
  const discountAmt = Math.min(subtotal, r2(dtype === 'pct' ? (subtotal * (Number(dval) || 0)) / 100 : Number(dval) || 0))
  const bill = useMemo(() => computeBill(items, discountAmt, supply, s.settings.pricesIncludeGst), [JSON.stringify(items), discountAmt, supply, s.settings.pricesIncludeGst])
  const overStock = cart.some((l) => l.qty > (sm[l.productId]?.sellable ?? 0) + 0.0004)
  const needsApproval = user.role === 'Cashier' && subtotal > 0 && discountAmt / subtotal > 0.1 + 1e-9

  const add = (p: Product, qty = defaultQty(p)) => {
    const avail = sm[p.id].sellable
    if (avail <= 0.0004) return toast.error(`${p.name} is out of stock`)
    setCart((c) => {
      const ex = c.find((l) => l.productId === p.id)
      if (ex) return c.map((l) => (l.productId === p.id ? { ...l, qty: r3(l.qty + qty) } : l))
      return [...c, { productId: p.id, qty }]
    })
  }
  const setQty = (id: string, qty: number) => setCart((c) => c.map((l) => (l.productId === id ? { ...l, qty: Math.max(0, r3(qty)) } : l)))
  const remove = (id: string) => setCart((c) => c.filter((l) => l.productId !== id))
  const reset = () => { setCart([]); setCustomerId(undefined); setDval(''); setSupplyMode('auto'); setPref('Cash') }

  const open = !!s.days.find((d) => d.date === todayStr())?.openedAt && !s.days.find((d) => d.date === todayStr())?.closedAt
  const charge = (m: PayMode | 'Credit') => {
    if (!cart.length) return toast.error('Add at least one item to the cart')
    if (cart.some((l) => l.qty <= 0)) return toast.error('Remove items with zero quantity')
    if (overStock) return toast.error('Some items exceed available stock')
    if (needsApproval) return toast.error('Discounts above 10% need Manager approval — switch role to Manager/Owner.')
    setCheckout(m)
  }
  const pay = (rows: PayRow[]) => {
    const r = run(() => act.createSale({
      customerId, items: cart.map((l) => ({ productId: l.productId, qty: l.qty })), discount: discountAmt, discountNote: discountAmt ? (dtype === 'pct' ? `${dval}% discount` : 'Flat discount') : undefined,
      supply, payments: rows.map((r) => ({ mode: r.mode, amount: Number(r.amount), ref: r.ref || undefined, provider: r.provider })),
    }))
    if (r.ok) { setCheckout(null); setDone(r.value as Sale); reset(); toast.success(`Invoice ${(r.value as Sale).invoiceNo} generated — stock updated`) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-4 lg:h-[calc(100vh-7.5rem)]">
      {/* catalogue */}
      <div className="card flex flex-col min-h-0 min-w-0">
        <div className="p-3 border-b border-stone-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="input !h-10 !pl-9" placeholder="Search sweets, snacks, SKU…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            {!open && <button onClick={() => go('operations')} className="cursor-pointer"><Badge tone="amber">Shop not open — open it in Shop Operations</Badge></button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {['All', ...CATEGORIES].map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn('px-3 h-8 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer border', cat === c ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50')}>{c}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {products.map((p) => {
              const i = sm[p.id]
              const out = i.sellable <= 0.0004
              const inCart = cart.find((l) => l.productId === p.id)
              return (
                <button key={p.id} disabled={out} onClick={() => add(p)}
                  className={cn('relative text-left rounded-xl border p-3 pl-4 bg-white transition-all overflow-hidden cursor-pointer', out ? 'opacity-50 cursor-not-allowed border-stone-200' : 'border-stone-200 hover:border-brand-400 hover:shadow-md active:scale-[0.98]', inCart && 'ring-2 ring-brand-500 border-brand-500')}>
                  <span className={cn('absolute left-0 top-0 bottom-0 w-1.5', CAT_COLOR[p.category])} />
                  <div className="text-[13px] font-semibold text-stone-900 leading-tight pr-1 min-h-[34px]">{p.name}</div>
                  <div className="mt-1.5 flex items-baseline gap-1"><span className="text-sm font-semibold num text-brand-700">{inr(p.sellPrice)}</span><span className="text-[11px] text-stone-500">/ {p.unit === 'kg' ? 'kg' : p.unit === 'pc' ? 'pc' : 'box'}</span></div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className={cn(out ? 'text-red-600 font-medium' : i.status === 'Low stock' ? 'text-amber-700' : 'text-stone-500')}>{out ? 'Out of stock' : fmtQty(i.sellable, p.unit)}</span>
                    {i.exp2 > 0 && !out && <span className="text-amber-700">⏱ expiring</span>}
                  </div>
                  {inCart && <span className="absolute top-2 right-2 size-5 rounded-full bg-brand-700 text-white text-[10px] grid place-items-center">✓</span>}
                </button>
              )
            })}
          </div>
          {!products.length && <div className="py-16 text-center text-sm text-stone-500">No products match.</div>}
        </div>
      </div>

      {/* cart */}
      <div className="card flex flex-col min-h-[560px] lg:min-h-0 min-w-0">
        <div className="p-3 border-b border-stone-200 space-y-2.5">
          <div className="flex items-center justify-between"><h2 className="font-semibold flex items-center gap-2"><ShoppingBag className="size-4 text-brand-700" />Current bill</h2>{cart.length > 0 && <button className="text-xs text-stone-500 hover:text-red-600 cursor-pointer" onClick={reset}>Clear all</button>}</div>
          <CustomerPicker value={customerId} onChange={setCustomerId} />
          {cust && <div className="flex gap-2 text-[11px] text-stone-500"><span>{cust.type}</span>·<span>{cust.state}</span>{cust.gstin && <>·<span>GSTIN {cust.gstin}</span></>}{customerOutstanding(s, cust) > 0 && <span className="text-red-600 font-medium">· Outstanding {inr(customerOutstanding(s, cust))}</span>}</div>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!cart.length && (
            <div className="h-full grid place-items-center text-center p-6"><div><div className="mx-auto size-12 rounded-full bg-brand-50 grid place-items-center mb-3"><ShoppingBag className="size-5 text-brand-600" /></div><div className="text-sm font-medium text-stone-700">Cart is empty</div><div className="text-xs text-stone-500 mt-1">Tap a product to add it. Weights are billed in grams.</div></div></div>
          )}
          {cart.map((l) => {
            const p = s.products.find((x) => x.id === l.productId)!
            const avail = sm[p.id].sellable
            const over = l.qty > avail + 0.0004
            return (
              <div key={l.productId} className="px-3 py-2.5 border-b border-stone-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-[13px] font-medium text-stone-900 truncate">{p.name}</div><div className="text-[11px] text-stone-500 num">{inr(p.sellPrice)} / {p.unit} · GST {p.gstRate}%</div></div>
                  <div className="text-right"><div className="text-[13px] font-semibold num">{inr2(l.qty * p.sellPrice)}</div><button className="text-stone-400 hover:text-red-600 cursor-pointer" onClick={() => remove(p.id)}><X className="size-3.5" /></button></div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {p.unit === 'kg' ? (
                    <>
                      <button className="btn-secondary btn-sm btn-icon" onClick={() => setQty(p.id, l.qty - 0.1)}><Minus className="size-3.5" /></button>
                      <div className="relative w-24"><input type="number" className="input !h-8 !pr-8 num" value={Math.round(l.qty * 1000)} onChange={(e) => setQty(p.id, Number(e.target.value) / 1000)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-stone-500">g</span></div>
                      <button className="btn-secondary btn-sm btn-icon" onClick={() => setQty(p.id, l.qty + 0.1)}><Plus className="size-3.5" /></button>
                      <div className="flex gap-1 ml-auto">{[250, 500, 1000].map((g) => <button key={g} className="kbd cursor-pointer hover:bg-stone-100 !py-1" onClick={() => setQty(p.id, g / 1000)}>{g >= 1000 ? '1 kg' : g + ' g'}</button>)}</div>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary btn-sm btn-icon" onClick={() => setQty(p.id, l.qty - 1)}><Minus className="size-3.5" /></button>
                      <input type="number" className="input !h-8 !w-16 text-center num" value={l.qty} onChange={(e) => setQty(p.id, Math.round(Number(e.target.value)))} />
                      <button className="btn-secondary btn-sm btn-icon" onClick={() => setQty(p.id, l.qty + 1)}><Plus className="size-3.5" /></button>
                      <div className="flex gap-1 ml-auto">{(p.unit === 'pc' ? [5, 10, 25] : [5, 10, 25]).map((n) => <button key={n} className="kbd cursor-pointer hover:bg-stone-100 !py-1" onClick={() => setQty(p.id, l.qty + n)}>+{n}</button>)}</div>
                    </>
                  )}
                </div>
                {over && <div className="text-[11px] text-red-600 mt-1">Only {fmtQty(avail, p.unit)} available (FEFO, non-expired)</div>}
              </div>
            )
          })}
        </div>
        <div className="border-t border-stone-200 p-3 space-y-2.5 bg-stone-50/60 rounded-b-xl">
          <div className="flex items-end gap-2">
            <Field label="Discount" className="flex-1"><NumInput value={dval} onChange={setDval} placeholder="0" step="any" /></Field>
            <Segmented size="sm" value={dtype} onChange={setDtype} options={[{ id: 'pct', label: '%' }, { id: 'amt', label: '₹' }]} />
            <Field label="GST supply"><select className="input !w-28" value={supplyMode} onChange={(e) => setSupplyMode(e.target.value as any)}><option value="auto">Auto</option><option value="intra">Intra-state</option><option value="inter">Inter-state</option></select></Field>
          </div>
          {needsApproval && <Notice tone="red">Cashier discount limit is 10%. Ask a Manager to approve.</Notice>}
          <div className="text-xs space-y-1 text-stone-600">
            <div className="flex justify-between"><span>Subtotal</span><span className="num">{inr2(bill.subtotal)}</span></div>
            {bill.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span className="num">-{inr2(bill.discount)}</span></div>}
            <div className="flex justify-between"><span>Taxable value</span><span className="num">{inr2(bill.taxable)}</span></div>
            {supply === 'intra' ? (
              <><div className="flex justify-between"><span>CGST</span><span className="num">{inr2(bill.cgst)}</span></div><div className="flex justify-between"><span>SGST</span><span className="num">{inr2(bill.sgst)}</span></div></>
            ) : (
              <div className="flex justify-between"><span>IGST</span><span className="num">{inr2(bill.igst)}</span></div>
            )}
            <div className="flex justify-between"><span>Round off</span><span className="num">{inr2(bill.roundOff)}</span></div>
          </div>
          <div className="flex items-center justify-between pt-1"><span className="text-sm font-semibold">Total</span><span className="text-2xl font-semibold num text-brand-800">{inr(bill.total)}</span></div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-secondary !h-11" onClick={() => charge('Cash')}><Banknote className="size-4" />Cash</button>
            <button className="btn-secondary !h-11" onClick={() => charge('UPI')}><QrCode className="size-4" />UPI</button>
            <button className="btn-secondary !h-11" onClick={() => charge('Card')}><CreditCard className="size-4" />Card</button>
          </div>
          <button className="btn-accent w-full !h-11 text-sm" onClick={() => charge(pref)}>Charge {inr(bill.total)}</button>
          <p className="text-[10.5px] text-stone-500 text-center">Prices {s.settings.pricesIncludeGst ? 'include' : 'exclude'} GST · Stock allocated First-Expiry-First-Out</p>
        </div>
      </div>

      {checkout && <Checkout total={bill.total} customerId={customerId} pref={checkout} onClose={() => setCheckout(null)} onPay={pay} />}
      <InvoiceModal sale={done} onClose={() => setDone(null)} />
    </div>
  )
}
