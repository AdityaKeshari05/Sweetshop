import { ArrowRight, Clock, CreditCard, Factory, PartyPopper, Sun, Trash2, Truck } from 'lucide-react'
import { useStore, actions, currentUser } from '../lib/store'
import { bus } from '../lib/bus'
import { go } from '../lib/perm'
import { Badge, Card, Notice, PageHeader, confirmDialog, run } from '../components/ui'
import { fmtDate, fmtTime, todayStr } from '../lib/util'

export default function Guide() {
  const s = useStore()
  const user = currentUser(s)
  const rec = s.days.find((d) => d.date === todayStr())
  const scenarios = [
    { k: 'A', icon: Sun, title: 'Morning shop opening', who: 'Manager', text: `Rajesh opens the shop at ${fmtTime(s.settings.openTime)}, records the opening cash, reviews stock, pending orders, attendance and today's expiries.`, status: rec?.openedAt ? `Already opened today at ${fmtTime(rec.openedAt)}. Use “Reopen” after closing to replay.` : 'Not yet opened — try it now.', cta: 'Open Shop Operations', go: () => go('operations') },
    { k: 'B', icon: CreditCard, title: 'Walk-in customer pays by UPI', who: 'Cashier', text: 'Sell 500 g Kaju Katli and 1 kg Motichoor Laddu, collect by UPI, generate the GST invoice and watch stock fall automatically (FEFO batch allocation).', status: 'Loads both items into the POS cart with UPI preselected.', cta: 'Load into POS', go: () => { bus.posPreset = { items: [{ name: 'Kaju Katli', qty: 0.5 }, { name: 'Motichoor Laddu', qty: 1 }], pay: 'UPI' }; go('pos') } },
    { k: 'C', icon: Trash2, title: 'Expiry & wastage', who: 'Manager / Inventory', text: 'An old batch of Rasmalai expired yesterday. Record the wasted quantity — stock, wastage cost and the P&L update instantly.', status: 'Opens the wastage form pre-filled with the expired Rasmalai batch.', cta: 'Record wastage', go: () => { bus.wastagePreset = { product: 'Rasmalai', expired: true }; go('expiry') } },
    { k: 'D', icon: Truck, title: 'Supplier purchase', who: 'Inventory', text: `Purchase order PO-0001 from Shree Dairy Suppliers is due today. Receive the goods: new batches are created, stock rises, a purchase invoice is booked and the supplier payable increases. Then record a part-payment.`, status: 'Opens the goods-received dialog for PO-0001.', cta: 'Receive PO-0001', go: () => { bus.receivePO = 'po_1'; go('suppliers') } },
    { k: 'E', icon: PartyPopper, title: 'Diwali corporate order', who: 'Manager', text: 'Bharat Tech Solutions has booked 100 Assorted Sweet Boxes (₹35,000 advance received). Move the order Confirmed → Preparing (stock is allocated once) → Ready → Dispatched → Delivered, collecting the balance on delivery.', status: 'Order ORD-0020 in the Festival module.', cta: 'Open Festival module', go: () => go('festival') },
    { k: 'F', icon: Clock, title: 'Daily closing', who: 'Manager', text: 'Reconcile cash, UPI and card, count the drawer, record the shortage/excess and generate the printable closing sales & profit summary.', status: 'Closing section appears once the shop is open.', cta: 'Open Shop Operations', go: () => go('operations') },
  ]
  return (
    <div>
      <PageHeader title="Demo Guide" subtitle="Six ready-made scenarios to walk a shop owner through a full business day. Every action below is live — nothing is mocked." />
      <div className="grid lg:grid-cols-2 gap-4">
        {scenarios.map((x) => (
          <Card key={x.k}>
            <div className="flex gap-3.5">
              <div className="size-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0"><x.icon className="size-5" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2"><Badge tone="brand">Scenario {x.k}</Badge><Badge>{x.who}</Badge></div>
                <h3 className="font-semibold mt-1.5">{x.title}</h3>
                <p className="text-[13px] text-stone-600 mt-1 leading-relaxed">{x.text}</p>
                <p className="text-xs text-stone-500 mt-1.5 italic">{x.status}</p>
                <button className="btn-primary btn-sm mt-3" onClick={x.go}>{x.cta}<ArrowRight className="size-3.5" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title="Try different roles"><p className="text-[13px] text-stone-600">Use the profile menu (top right) to switch between <b>Owner/Admin</b>, <b>Manager</b>, <b>Cashier</b> and <b>Inventory Staff</b>. Menus, profit KPIs, refunds and supplier payments change per role. Current role: <Badge tone="brand">{user.title}</Badge></p></Card>
        <Card title="Persistence"><p className="text-[13px] text-stone-600">All changes are stored in this browser (localStorage) and survive a refresh. Demo data is generated relative to today and refreshes automatically each new day.</p></Card>
        <Card title="Reset the demo"><p className="text-[13px] text-stone-600 mb-3">Restore every module to its original starting state.</p>
          <button className="btn-secondary" disabled={user.role !== 'Owner'} onClick={async () => { if (await confirmDialog({ title: 'Reset all demo data?', message: 'All sales, orders and changes you made will be replaced with the original sample data.', danger: true, confirmLabel: 'Reset demo' })) run(() => actions.resetDemo(), 'Demo data restored to its original state') }}>Reset demo data</button>
          {user.role !== 'Owner' && <p className="text-[11px] text-stone-500 mt-1.5">Owner/Admin only.</p>}</Card>
      </div>
      <div className="mt-4"><Notice tone="blue">Data shown is fictional demonstration data for “Shree Mishtanna Bhandar”. GST rates, tax reports and UPI/card records are simulated and are not filed returns, certified compliance, or live payment-gateway records. Today is {fmtDate(todayStr())}.</Notice></div>
    </div>
  )
}
