import type { AttStatus, Batch, Customer, Order, Product, State, Unit } from './types'
import { computeBill, clearMemo } from './calc'
import {
  opAdvanceOrder, opCancelOrder, opCloseShop, opCreateOrder, opCreateSale, opOpenShop, opDecideOrder, setClock, NOW,
  type OrderInput,
} from './ops'
import { addDays, dow, mulberry32, r2, todayStr, uid, fyLabel, datesBetween, fmtDate } from './util'

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)]

export function buildSeed(userId = 'u_owner'): State {
  const today = todayStr()
  const rnd = mulberry32(20261124)
  const d: State = {
    version: 3, seedDate: today, userId,
    settings: {
      businessName: 'Shree Mishtanna Bhandar', legalName: 'Shree Mishtanna Bhandar (Demo Proprietorship)', gstin: '19ABCDE1234F1Z5', fssai: '12345678901234 (demo)',
      address: '12, Gariahat Road, Ballygunge, Kolkata, West Bengal 700019', state: 'West Bengal', stateCode: '19', phone: '+91 98300 12345', upiId: 'shreemishtanna@demo',
      openTime: '10:00', closeTime: '22:00', lateGraceMin: 15, pricesIncludeGst: true, monthlyRent: 50000, currency: 'INR',
    },
    locations: [{ id: 'main', name: 'Main Outlet — Gariahat' }, { id: 'godown', name: 'Cold Storage / Godown' }],
    users: [
      { id: 'u_owner', name: 'Mahesh Agarwal', role: 'Owner', title: 'Owner / Admin' },
      { id: 'u_manager', name: 'Rajesh Kumar', role: 'Manager', title: 'Shop Manager' },
      { id: 'u_cashier', name: 'Suman Das', role: 'Cashier', title: 'Cashier' },
      { id: 'u_inv', name: 'Ramesh Yadav', role: 'Inventory', title: 'Inventory Assistant' },
    ],
    products: [], batches: [], ledger: [], sales: [], payments: [], customers: [], orders: [], festivals: [], suppliers: [], pos: [], purchaseInvoices: [],
    supplierPayments: [], expenses: [], staff: [], attendance: [], wastage: [], days: [],
    counters: { invoice: 0, order: 0, po: 0, grn: 0, sku: 1000, batch: 0 },
  }

  /* ---------- suppliers ---------- */
  const sup = (key: string, name: string, contact: string, phone: string, address: string, state: string, gstin: string, terms: number, supplies: string) => {
    const s = { id: 'sup_' + key, name, contact, phone, address, state, gstin, terms, supplies }
    d.suppliers.push(s)
    return s.id
  }
  sup('dairy', 'Shree Dairy Suppliers', 'Gopal Mishra', '98301 10001', '45, B.K. Pal Avenue, Kolkata 700005', 'West Bengal', '19AAACS4521A1Z3', 7, 'Chhena, khoya, milk sweets')
  sup('dry', 'Kolkata Dry Fruits Traders', 'Imran Qureshi', '98302 20002', '18, Mullick Street, Posta, Kolkata 700007', 'West Bengal', '19AABFK7788M1Z9', 15, 'Cashew, pista, anjeer, almonds')
  sup('sugar', 'Bengal Sugar Distributors', 'Pradip Saha', '98303 30003', '7, Strand Road, Howrah 711101', 'West Bengal', '19AAHFB2210K1ZP', 30, 'Sugar, jaggery, ghee, besan')
  sup('pack', 'Fresh Packaging Solutions', 'Neelam Jain', '98304 40004', '22, Canal Street, Kolkata 700013', 'West Bengal', '19AAJPF9087D1Z1', 15, 'Boxes, ribbons, sleeves, carry bags')
  sup('jaipur', 'Jaipur Namkeen & Spices Co.', 'Mukesh Soni', '94140 50005', 'Sitapura Industrial Area, Jaipur 302022', 'Rajasthan', '08AAECJ5566N1ZB', 21, 'Namkeen, bhujia, snack mixes (inter-state)')

  /* ---------- products ---------- */
  type BSpec = [number, number, number] // producedDaysAgo, expiryDaysFromToday, qty
  const prodSpec: [string, string, Unit, number, number, number, number, number, string, BSpec[]][] = [
    // name, category, unit, cost, price, gst, minStock, shelfLife, supplier, batches
    ['Rasmalai', 'Milk Sweets', 'kg', 290, 450, 5, 4, 2, 'dairy', [[3, -1, 4.5], [0, 1, 9]]],
    ['Milk Cake', 'Milk Sweets', 'kg', 300, 480, 5, 4, 7, 'dairy', [[2, 5, 11.5]]],
    ['Kalakand', 'Milk Sweets', 'kg', 290, 460, 5, 4, 4, 'dairy', [[1, 3, 8]]],
    ['Mathura Peda', 'Milk Sweets', 'kg', 280, 440, 5, 4, 10, 'dairy', [[3, 7, 14]]],
    ['Bengali Rasgulla', 'Bengali Sweets', 'kg', 140, 240, 5, 6, 5, 'dairy', [[1, 4, 22]]],
    ['Sandesh', 'Bengali Sweets', 'kg', 330, 520, 5, 3, 3, 'dairy', [[1, 2, 6.5]]],
    ['Chamcham', 'Bengali Sweets', 'kg', 220, 360, 5, 3, 4, 'dairy', [[1, 3, 7]]],
    ['Mishti Doi', 'Bengali Sweets', 'pc', 22, 40, 5, 30, 4, 'dairy', [[1, 3, 12]]],
    ['Kaju Katli', 'Dry Fruit Sweets', 'kg', 640, 1000, 5, 5, 20, 'dry', [[5, 15, 16.5]]],
    ['Pista Barfi', 'Dry Fruit Sweets', 'kg', 820, 1200, 5, 3, 20, 'dry', [[6, 14, 7]]],
    ['Anjeer Roll', 'Dry Fruit Sweets', 'kg', 740, 1100, 5, 3, 25, 'dry', [[4, 21, 5.5]]],
    ['Motichoor Laddu', 'Traditional Sweets', 'kg', 310, 500, 5, 5, 7, 'sugar', [[2, 5, 18]]],
    ['Besan Laddu', 'Traditional Sweets', 'kg', 260, 420, 5, 6, 12, 'sugar', [[3, 9, 4.5]]],
    ['Soan Papdi', 'Traditional Sweets', 'kg', 190, 320, 5, 5, 30, 'sugar', []],
    ['Jalebi', 'Traditional Sweets', 'kg', 170, 300, 5, 3, 1, 'sugar', [[1, 0, 3.2], [0, 1, 6]]],
    ['Gulab Jamun', 'Traditional Sweets', 'kg', 160, 280, 5, 5, 4, 'sugar', [[5, -1, 2], [1, 3, 16]]],
    ['Samosa', 'Snacks', 'pc', 9, 20, 5, 40, 1, 'jaipur', [[1, 0, 35], [0, 1, 120]]],
    ['Kachori', 'Snacks', 'pc', 12, 25, 5, 40, 1, 'jaipur', [[0, 1, 100]]],
    ['Dhokla', 'Snacks', 'kg', 130, 260, 5, 3, 1, 'jaipur', [[0, 1, 6]]],
    ['Aloo Tikki', 'Snacks', 'pc', 14, 30, 5, 30, 1, 'jaipur', [[0, 1, 60]]],
    ['Namkeen Mixture', 'Namkeen', 'kg', 180, 300, 12, 8, 45, 'jaipur', [[10, 35, 26]]],
    ['Bhujia Sev', 'Namkeen', 'kg', 165, 280, 12, 8, 45, 'jaipur', [[10, 35, 22]]],
    ['Moong Dal Namkeen', 'Namkeen', 'kg', 190, 320, 12, 6, 45, 'jaipur', [[12, 33, 15]]],
    ['Assorted Sweet Box', 'Gift Boxes', 'box', 480, 750, 18, 20, 10, 'sugar', [[2, 8, 90], [0, 10, 80]]],
    ['Kaju Katli Gift Box', 'Gift Boxes', 'box', 340, 550, 18, 15, 20, 'dry', [[3, 17, 64]]],
    ['Dry Fruit Premium Box', 'Gift Boxes', 'box', 980, 1450, 18, 10, 30, 'dry', [[4, 26, 45]]],
  ]
  const hsn: Record<string, string> = { 'Milk Sweets': '2106', 'Bengali Sweets': '2106', 'Dry Fruit Sweets': '2106', 'Traditional Sweets': '1704', Snacks: '2106', Namkeen: '2106', 'Gift Boxes': '2106' }
  for (const [name, category, unit, cost0, price, gst, min, shelf, supKey, batches] of prodSpec) {
    const cost = Math.round(cost0 * 0.88)
    const p: Product = { id: 'prd_' + name.toLowerCase().replace(/[^a-z]+/g, '_'), name, sku: `SMB-${++d.counters.sku}`, category, unit, purchasePrice: cost, sellPrice: price, gstRate: gst, hsn: hsn[category], minStock: min, supplierId: 'sup_' + supKey, shelfLife: shelf }
    d.products.push(p)
    batches.forEach(([prodAgo, expIn, qty], k) => {
      const produced = addDays(today, -prodAgo)
      const b: Batch = {
        id: `bat_${p.id.slice(4)}_${k}`, productId: p.id, batchNo: `B-${produced.slice(2).replace(/-/g, '')}-${pad(++d.counters.batch, 3)}`, produced, received: produced, expiry: addDays(today, expIn),
        qty, initialQty: qty * (1 + rnd() * 0.5), cost, locationId: 'main', supplierId: p.supplierId,
      }
      b.initialQty = Math.round(b.initialQty * 10) / 10
      d.batches.push(b)
      d.ledger.push({ id: uid('led'), at: produced + 'T09:00', productId: p.id, batchId: b.id, batchNo: b.batchNo, type: 'purchase', qty: b.initialQty, ref: 'Opening / production', locationId: 'main', by: 'Ramesh Yadav' })
    })
  }
  // a little stock in cold storage (multi-location demo)
  const kk = d.batches.find((b) => b.productId === 'prd_kaju_katli')!
  d.batches.push({ ...kk, id: 'bat_kk_godown', qty: 6, initialQty: 6, locationId: 'godown' })
  const asb = d.batches.find((b) => b.productId === 'prd_assorted_sweet_box')!
  d.batches.push({ ...asb, id: 'bat_asb_godown', qty: 20, initialQty: 20, locationId: 'godown' })
  const P = (n: string) => d.products.find((p) => p.name === n)!

  /* ---------- customers ---------- */
  const custSpec: [string, string, Customer['type'], string, string?, string?][] = [
    ['Anita Verma', '9830111101', 'Regular', '24, Lake Gardens, Kolkata 700045'],
    ['Rohit Banerjee', '9830111102', 'Regular', '8B, Ballygunge Place, Kolkata 700019'],
    ['Priya Chatterjee', '9830111103', 'Regular', '51, Salt Lake Sector III, Kolkata 700106'],
    ['Sunil Gupta', '9830111104', 'Regular', '3, Dum Dum Road, Kolkata 700030'],
    ['Meera Iyer', '9830111105', 'Regular', '17, Jadavpur 8B Bus Stand, Kolkata 700032'],
    ['Arjun Mehta', '9830111106', 'Regular', '102, Mehta Residency, New Alipore, Kolkata 700053'],
    ['Kavita Joshi', '9830111107', 'Regular', '9, Behala Chowrasta, Kolkata 700034'],
    ['Debashis Roy', '9830111108', 'Regular', '33, Gariahat Road (S), Kolkata 700031'],
    ['Farhan Sheikh', '9830111109', 'Regular', '12, Park Circus, Kolkata 700017'],
    ['Neha Kapoor', '9830111110', 'Regular', '6, Southern Avenue, Kolkata 700029'],
    ['Vikram Singhania', '9830111111', 'Regular', '4, Alipore Park Road, Kolkata 700027'],
    ['Sanjana Dutta', '9830111112', 'Regular', '45, Hindustan Park, Kolkata 700029'],
    ['Harish Patel', '9830111113', 'Regular', '19, Rashbehari Avenue, Kolkata 700029'],
    ['Gupta Caterers', '9830111114', 'Regular', '88, Lake Town, Kolkata 700089'],
    ['Bharat Tech Solutions Pvt Ltd', '9830111115', 'Corporate', 'Sector V, Salt Lake Electronics Complex, Kolkata 700091', '19AABCB1234C1Z7'],
    ['Shah & Sons Jewellers', '9830111116', 'Corporate', '21, Rashbehari Avenue, Kolkata 700029', '19AAFFS5678D1ZQ'],
    ['Kolkata Club', '9830111117', 'Corporate', '241, Ballygunge Circular Road, Kolkata 700019', '19AAATK3344E1Z2'],
    ["St. Xavier's Alumni Association", '9830111118', 'Corporate', '30, Park Street, Kolkata 700016'],
    ['Raj Traders (Jaipur)', '9414011119', 'Corporate', 'Johari Bazar, Jaipur, Rajasthan 302003', '08AABCR6677F1ZK'],
  ]
  custSpec.forEach(([name, mobile, type, address, gstin], i) => {
    d.customers.push({
      id: 'cus_' + (i + 1), name, mobile, type, address, gstin, state: name.includes('Jaipur') ? 'Rajasthan' : 'West Bengal', creditLimit: type === 'Corporate' ? 100000 : 15000,
      email: type === 'Corporate' ? name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') + '@example.com' : undefined, createdAt: addDays(today, -90 + i * 3),
      notes: i === 1 ? 'Prefers less sugar. Collects every Sunday.' : i === 5 ? 'Large family orders on festivals.' : undefined,
    })
  })
  const C = (n: string) => d.customers.find((c) => c.name.startsWith(n))!

  /* ---------- staff & attendance ---------- */
  const staffSpec: [string, string, string, number, string][] = [
    ['Rajesh Kumar', 'Shop Manager', '9830122201', 35000, '2019-04-01'],
    ['Amit Sharma', 'Sales Executive', '9830122202', 18000, '2021-07-15'],
    ['Suman Das', 'Cashier', '9830122203', 20000, '2020-02-10'],
    ['Pooja Singh', 'Sales Executive', '9830122204', 18000, '2022-09-05'],
    ['Ramesh Yadav', 'Inventory Assistant', '9830122205', 17000, '2022-01-20'],
  ]
  staffSpec.forEach(([name, role, phone, salary, joined], i) => d.staff.push({ id: 'stf_' + (i + 1), name, role, phone, monthlySalary: salary, joined, active: true }))
  for (const date of datesBetween(addDays(today, -40), today)) {
    for (const s of d.staff) {
      const r = rnd()
      let status: AttStatus = r < 0.86 ? 'Present' : r < 0.91 ? 'Half-day' : r < 0.95 ? 'Leave' : 'Absent'
      if (dow(date) === 0 && s.id === 'stf_5') status = 'Leave' // weekly off pattern
      let checkIn: string | undefined, checkOut: string | undefined
      if (status === 'Present' || status === 'Half-day') {
        const m = 9 * 60 + 46 + Math.floor(rnd() * 32)
        checkIn = `${pad(Math.floor(m / 60), 2)}:${pad(m % 60, 2)}`
        const o = status === 'Half-day' ? 15 * 60 + Math.floor(rnd() * 40) : 22 * 60 + Math.floor(rnd() * 25)
        checkOut = `${pad(Math.floor(o / 60), 2)}:${pad(o % 60, 2)}`
      }
      if (date === today) {
        const t: Record<string, [AttStatus, string?]> = { stf_1: ['Present', '09:52'], stf_2: ['Present', '10:05'], stf_3: ['Present', '09:58'], stf_4: ['Leave'], stf_5: ['Present', '10:27'] }
        status = t[s.id][0]; checkIn = t[s.id][1]; checkOut = undefined
      }
      d.attendance.push({ id: uid('att'), date, staffId: s.id, status, checkIn, checkOut })
    }
  }

  /* ---------- festivals ---------- */
  const xmas = today > `${today.slice(0, 4)}-12-25` ? `${+today.slice(0, 4) + 1}-12-25` : `${today.slice(0, 4)}-12-25`
  d.festivals.push(
    { id: 'fes_diwali', name: 'Diwali', date: addDays(today, 9), active: true, notes: 'Demo date (relative to today). Edit to match the real calendar.' },
    { id: 'fes_xmas', name: 'Christmas', date: xmas, active: true, notes: 'Plum-cake style sweets, gift hampers' },
    { id: 'fes_ny', name: 'New Year', date: `${+xmas.slice(0, 4) + 1}-01-01`, active: true },
    { id: 'fes_durga', name: 'Durga Puja', date: addDays(today, -35), active: false, notes: 'Season completed (approx. date)' },
  )

  /* ---------- historic & today's sales ---------- */
  const names = d.products.map((p) => p.name)
  const popular = new Set(['Kaju Katli', 'Motichoor Laddu', 'Bengali Rasgulla', 'Gulab Jamun', 'Samosa', 'Kachori', 'Jalebi', 'Assorted Sweet Box', 'Namkeen Mixture', 'Rasmalai', 'Milk Cake', 'Sandesh'])
  const cashiers = ['Suman Das', 'Suman Das', 'Amit Sharma', 'Pooja Singh']
  const kgQ = [0.5, 0.5, 1, 1, 1.5, 2, 2, 3, 5]
  const pcQ = [4, 6, 10, 12, 20]
  const boxQ = [1, 2, 2, 3, 5]
  const regulars = d.customers.filter((c) => c.type !== 'Walk-in' && c.state === 'West Bengal')

  function genDay(day: string, n: number, real: boolean, exclude: Set<string>, tMin: number, tMax: number) {
    const pool = names.filter((x) => !exclude.has(x)).flatMap((x) => (popular.has(x) ? [x, x, x] : [x]))
    const times = Array.from({ length: n }, () => Math.floor(tMin + rnd() * (tMax - tMin))).sort((a, b) => a - b)
    for (const t of times) {
      const at = `${day}T${pad(Math.floor(t / 60), 2)}:${pad(t % 60, 2)}`
      const k = 1 + Math.floor(rnd() * 3.2)
      const chosen = new Set<string>()
      while (chosen.size < k) chosen.add(pick(rnd, pool))
      let items = [...chosen].map((nm) => {
        const p = P(nm)
        return { productId: p.id, qty: p.unit === 'kg' ? pick(rnd, kgQ) : p.unit === 'pc' ? pick(rnd, pcQ) : pick(rnd, boxQ) }
      })
      if (real) {
        // keep today's seeded sales within available stock so the scenario stock levels stay intact
        items = items.map((it) => {
          const avail = d.batches.filter((b) => b.productId === it.productId && b.locationId === 'main' && b.expiry >= today).reduce((a, b) => a + b.qty, 0)
          const p = d.products.find((x) => x.id === it.productId)!
          const cap = p.unit === 'kg' ? Math.floor(avail * 0.25 * 2) / 2 : Math.floor(avail * 0.25)
          return { ...it, qty: Math.min(it.qty, cap) }
        }).filter((it) => it.qty > 0)
        if (!items.length) continue
      }
      const cust = rnd() < 0.45 ? pick(rnd, regulars) : undefined
      const subtotal = items.reduce((s, it) => s + it.qty * d.products.find((p) => p.id === it.productId)!.sellPrice, 0)
      const discount = rnd() < 0.12 ? Math.round((subtotal * pick(rnd, [0.03, 0.05, 0.1])) / 10) * 10 : 0
      const bill = computeBill(items.map((it) => { const p = d.products.find((x) => x.id === it.productId)!; return { productId: p.id, name: p.name, unit: p.unit, hsn: p.hsn, gstRate: p.gstRate, qty: it.qty, rate: p.sellPrice } }), discount, 'intra', true)
      const total = bill.total
      const r = rnd()
      let payments: { mode: 'Cash' | 'UPI' | 'Card'; amount: number }[]
      if (r < 0.42) payments = [{ mode: 'UPI', amount: total }]
      else if (r < 0.72) payments = [{ mode: 'Cash', amount: total }]
      else if (r < 0.86) payments = [{ mode: 'Card', amount: total }]
      else if (r < 0.95) { const c = Math.round((total * 0.4) / 10) * 10; payments = [{ mode: 'Cash', amount: c }, { mode: 'UPI', amount: total - c }] }
      else if (!real && cust && cust.type === 'Regular') payments = rnd() < 0.5 ? [] : [{ mode: 'UPI', amount: Math.round((total * 0.5) / 10) * 10 }]
      else payments = [{ mode: 'UPI', amount: total }]
      if (real) setClock(at)
      const base = { customerId: cust?.id, items, discount, discountNote: discount ? 'Counter discount' : undefined, at, noStock: !real, cashier: pick(rnd, cashiers) }
      let sale
      try { sale = opCreateSale(d, { ...base, payments }) } catch { sale = opCreateSale(d, { ...base, payments: [{ mode: 'UPI', amount: total }] }) }
      if (!real && day >= addDays(today, -7)) {
        for (const l of sale.lines) d.ledger.push({ id: uid('led'), at, productId: l.productId, batchNo: 'HIST', type: 'sale', qty: -l.qty, ref: sale.invoiceNo, locationId: 'main', by: sale.cashier })
      }
    }
  }
  for (let off = 35; off >= 1; off--) {
    const day = addDays(today, -off)
    const weekend = dow(day) === 0 || dow(day) === 6
    const n = Math.round((11 + rnd() * 5) * (weekend ? 1.4 : 1) * (off < 12 && off > 3 ? 1.1 : 1))
    genDay(day, n, false, new Set(), 10 * 60 + 5, 21 * 60 + 50)
  }
  genDay(today, 22, true, new Set(['Rasmalai', 'Besan Laddu', 'Mishti Doi', 'Sandesh', 'Jalebi', 'Gulab Jamun', 'Soan Papdi', 'Assorted Sweet Box', 'Kaju Katli Gift Box', 'Dry Fruit Premium Box', 'Kaju Katli', 'Motichoor Laddu']), 10 * 60 + 8, 15 * 60 + 40)
  setClock(null)

  /* ---------- expenses ---------- */
  for (let off = 36; off >= 0; off--) {
    const day = addDays(today, -off)
    d.expenses.push({ id: uid('exp'), date: day, category: 'Electricity', amount: 380 + Math.round(rnd() * 90), mode: 'Bank', note: 'Daily accrual (EB bill)', by: 'Rajesh Kumar' })
    d.expenses.push({ id: uid('exp'), date: day, category: 'Gas & Fuel', amount: 600 + Math.round(rnd() * 150), mode: 'Cash', note: 'LPG / kitchen fuel', by: 'Rajesh Kumar' })
    d.expenses.push({ id: uid('exp'), date: day, category: 'Packaging', amount: 300 + Math.round(rnd() * 400), mode: 'Cash', note: 'Boxes, bags, ribbons', by: 'Rajesh Kumar' })
    if (rnd() < 0.3) d.expenses.push({ id: uid('exp'), date: day, category: pick(rnd, ['Transport', 'Maintenance', 'Other']), amount: 100 + Math.round(rnd() * 300), mode: 'Cash', note: pick(rnd, ['Delivery fuel', 'Cleaning supplies', 'Pest control', 'Tea & refreshments']), by: 'Rajesh Kumar' })
  }

  /* ---------- wastage ---------- */
  const wasteSeed: [number, string, number, string][] = [
    [1, 'Jalebi', 1.5, 'Expired'], [2, 'Rasmalai', 2.0, 'Expired'], [3, 'Samosa', 24, 'Quality rejection'], [4, 'Bengali Rasgulla', 1.2, 'Spoiled'], [6, 'Kachori', 18, 'Production excess'],
    [8, 'Sandesh', 0.8, 'Damaged'], [10, 'Dhokla', 1.5, 'Expired'], [12, 'Gulab Jamun', 2.2, 'Expired'], [0, 'Samosa', 6, 'Damaged'],
  ]
  for (const [ago, nm, qty, reason] of wasteSeed) {
    const p = P(nm)
    d.wastage.push({ id: uid('wst'), date: addDays(today, -ago), at: addDays(today, -ago) + 'T21:30', productId: p.id, batchId: 'HIST', batchNo: 'HIST', qty, reason, cost: r2(qty * p.purchasePrice), by: 'Ramesh Yadav' })
  }

  /* ---------- purchase invoices & supplier payments ---------- */
  const mkInv = (supKey: string, ago: number, lines: [string, number, number?][], paidPct: number, mode: 'Bank' | 'Cash' | 'UPI' = 'Bank', invNo?: string) => {
    const s = d.suppliers.find((x) => x.id === 'sup_' + supKey)!
    const inter = s.state !== d.settings.state
    const date = addDays(today, -ago)
    const ls = lines.map(([nm, qty, rate]) => {
      const p = nm.startsWith('~') ? undefined : P(nm)
      const gst = p ? p.gstRate : 18
      const r = rate ?? p!.purchasePrice
      const taxable = r2(qty * r)
      return { productId: p?.id, name: p ? p.name : nm.slice(1), unit: p ? p.unit : 'pc', qty, rate: r, gstRate: gst, taxable, tax: r2((taxable * gst) / 100) }
    })
    const taxable = r2(ls.reduce((a, l) => a + l.taxable, 0))
    const tax = r2(ls.reduce((a, l) => a + l.tax, 0))
    const inv = {
      id: uid('pinv'), invNo: invNo || `${s.name.split(' ')[0].slice(0, 3).toUpperCase()}/${pad(++d.counters.grn * 7 + 100, 4)}`, grnNo: `GRN-${pad(d.counters.grn, 4)}`, supplierId: s.id, date,
      dueDate: addDays(date, s.terms), lines: ls, taxable, cgst: inter ? 0 : r2(tax / 2), sgst: inter ? 0 : r2(tax - r2(tax / 2)), igst: inter ? tax : 0, total: r2(taxable + tax),
    }
    d.purchaseInvoices.push(inv)
    if (paidPct > 0) {
      const amt = paidPct >= 1 ? inv.total : Math.round(inv.total * paidPct)
      d.supplierPayments.push({ id: uid('spay'), date: addDays(date, Math.min(s.terms, 3)) > today ? today : addDays(date, Math.min(s.terms, 3)), supplierId: s.id, amount: amt, mode, ref: mode === 'Bank' ? 'NEFT' + Math.floor(1e9 + rnd() * 9e9) : undefined, allocations: [{ invoiceId: inv.id, amount: amt }], by: 'Mahesh Agarwal' })
    }
  }
  mkInv('dairy', 28, [['Milk Cake', 20], ['Kalakand', 12], ['Bengali Rasgulla', 25]], 1)
  mkInv('dairy', 14, [['Rasmalai', 15], ['Sandesh', 10], ['Chamcham', 10]], 1)
  mkInv('dairy', 6, [['Milk Cake', 15], ['Mathura Peda', 14], ['Bengali Rasgulla', 20]], 0.5)
  mkInv('dairy', 2, [['Rasmalai', 12], ['Kalakand', 8]], 0)
  mkInv('dry', 30, [['Kaju Katli', 25], ['Pista Barfi', 8]], 1)
  mkInv('dry', 20, [['Kaju Katli', 20], ['Anjeer Roll', 8], ['Dry Fruit Premium Box', 30]], 1)
  mkInv('dry', 5, [['Kaju Katli', 18], ['Kaju Katli Gift Box', 40]], 0.4)
  mkInv('sugar', 40, [['Motichoor Laddu', 25], ['Besan Laddu', 12]], 1)
  mkInv('sugar', 12, [['Motichoor Laddu', 20], ['Gulab Jamun', 18], ['Assorted Sweet Box', 80]], 0)
  mkInv('pack', 22, [['~Sweet boxes (1 kg) — printed', 600, 18], ['~Ribbons & greeting cards', 400, 6]], 1)
  mkInv('pack', 4, [['~Carry bags (medium)', 1000, 4.5], ['~Butter paper & trays', 50, 40]], 0)
  mkInv('jaipur', 18, [['Namkeen Mixture', 30], ['Bhujia Sev', 25], ['Moong Dal Namkeen', 15]], 1)
  mkInv('jaipur', 3, [['Namkeen Mixture', 25], ['Bhujia Sev', 20]], 0)
  d.purchaseInvoices.forEach((inv) => { if (inv.lines.some((l) => !l.productId)) d.expenses.push({ id: uid('exp'), date: inv.date, category: 'Packaging', amount: inv.taxable, mode: 'Bank', note: `Non-stock purchase (${inv.grnNo})`, auto: true, by: 'System' }) })
  // outstanding purchase orders (Scenario D)
  d.pos.push({
    id: 'po_1', poNo: `PO-${pad(++d.counters.po, 4)}`, supplierId: 'sup_dairy', date: addDays(today, -1), expected: today, status: 'Ordered', notes: 'Weekly dairy sweets replenishment',
    items: [
      { productId: P('Milk Cake').id, name: 'Milk Cake', unit: 'kg', qty: 20, rate: 300, gstRate: 5 },
      { productId: P('Rasmalai').id, name: 'Rasmalai', unit: 'kg', qty: 15, rate: 290, gstRate: 5 },
      { productId: P('Kalakand').id, name: 'Kalakand', unit: 'kg', qty: 10, rate: 290, gstRate: 5 },
      { productId: P('Bengali Rasgulla').id, name: 'Bengali Rasgulla', unit: 'kg', qty: 20, rate: 140, gstRate: 5 },
    ],
  })
  d.pos.push({
    id: 'po_2', poNo: `PO-${pad(++d.counters.po, 4)}`, supplierId: 'sup_pack', date: today, expected: addDays(today, 3), status: 'Ordered', notes: 'Diwali branded gift sleeves',
    items: [{ name: 'Diwali branded gift sleeves', unit: 'pc', qty: 300, rate: 12, gstRate: 18, expenseCat: 'Packaging' }, { name: 'Satin ribbons (roll)', unit: 'pc', qty: 40, rate: 85, gstRate: 18, expenseCat: 'Packaging' }],
  })
  d.pos.push({
    id: 'po_3', poNo: `PO-${pad(++d.counters.po, 4)}`, supplierId: 'sup_dry', date: today, expected: addDays(today, 2), status: 'Ordered',
    items: [{ productId: P('Kaju Katli').id, name: 'Kaju Katli', unit: 'kg', qty: 30, rate: 640, gstRate: 5 }, { productId: P('Pista Barfi').id, name: 'Pista Barfi', unit: 'kg', qty: 10, rate: 820, gstRate: 5 }],
  })

  /* ---------- orders ---------- */
  const O = (o: Omit<Partial<OrderInput>, 'items'> & { cust: string; items: [string, number][]; due: number }, steps: string[], daysAgo = 0, hour = 11) => {
    const at = `${addDays(today, -daysAgo)}T${pad(hour, 2)}:15`
    setClock(at)
    const { cust, items, due, ...rest } = o
    const needsDecision = steps[0] === 'accept' || steps[0] === 'reject'
    const order = opCreateOrder(d, {
      customerId: C(cust).id, source: 'Walk-in', kind: 'Regular', delivery: 'Pickup', ...(needsDecision ? { acceptance: 'Pending' as const } : {}), ...rest,
      items: items.map(([n, q]) => ({ productId: P(n).id, qty: q })), dueDate: addDays(today, due), at,
    } as OrderInput)
    steps.forEach((st, k) => {
      setClock(`${addDays(today, -Math.max(0, daysAgo - 1))}T${pad(Math.min(20, hour + 1 + k), 2)}:30`)
      if (st === 'accept') opDecideOrder(d, order.id, true)
      else if (st === 'reject') opDecideOrder(d, order.id, false, 'Item currently out of stock')
      else if (st === 'cancel') opCancelOrder(d, order.id, { reason: 'Customer changed plan', refundMode: 'UPI' })
      else if (st === 'deliver') opAdvanceOrder(d, order.id, { collect: { mode: 'UPI', amount: Math.max(0, order.total - (d.payments.filter((p) => p.orderId === order.id && p.type === 'receipt').reduce((s, p) => s + p.amount, 0))) } })
      else opAdvanceOrder(d, order.id)
    })
    setClock(null)
    return order
  }
  const adv = (amount: number, mode: 'Cash' | 'UPI' | 'Card' = 'UPI') => ({ amount, mode, full: amount < 0 })
  // customer orders
  O({ cust: 'Anita', items: [['Rasmalai', 3], ['Gulab Jamun', 2]], due: 1, kind: 'Advance', advance: adv(500, 'Cash'), notes: 'Birthday party — please write “Happy Birthday” on box' }, ['advance'], 1, 12)
  O({ cust: 'Gupta Caterers', items: [['Samosa', 100], ['Kachori', 60]], due: 0, source: 'Phone', kind: 'Bulk', delivery: 'Delivery', advance: adv(1500), notes: 'Deliver before 5 PM, office tea-time' }, ['advance'], 1, 15)
  O({ cust: 'Rohit', items: [['Kaju Katli Gift Box', 10]], due: 1, kind: 'Advance', advance: adv(2500), packaging: 'Gold ribbon' }, ['advance', 'advance', 'advance'], 2, 11)
  O({ cust: 'Priya', items: [['Kaju Katli', 1], ['Pista Barfi', 0.5], ['Anjeer Roll', 0.5]], due: 2, source: 'WhatsApp', kind: 'Custom Box', advance: adv(1000), packaging: 'Premium wooden box, mix of 3 sweets' }, [], 0, 10)
  O({ cust: 'Sunil', items: [['Motichoor Laddu', 5]], due: 3, source: 'Phone', delivery: 'Delivery', advance: adv(1000, 'Cash'), notes: 'Satyanarayan pooja prasad' }, ['advance'], 0, 11)
  O({ cust: 'Meera', items: [['Milk Cake', 2], ['Mathura Peda', 1]], due: 1, kind: 'Advance', advance: adv(800), delivery: 'Pickup' }, ['advance', 'advance', 'advance'], 1, 17)
  O({ cust: 'Arjun', items: [['Assorted Sweet Box', 6]], due: -3, kind: 'Advance', advance: adv(2000, 'Cash') }, ['advance', 'advance', 'advance', 'deliver'], 5, 11)
  O({ cust: 'Kavita', items: [['Kaju Katli', 1.5], ['Namkeen Mixture', 2]], due: -2, source: 'Phone', delivery: 'Delivery', advance: adv(500) }, ['advance', 'advance', 'advance', 'advance', 'deliver'], 4, 10)
  O({ cust: 'Debashis', items: [['Kaju Katli', 2], ['Anjeer Roll', 1]], due: 2, source: 'WhatsApp', kind: 'Custom Box', advance: adv(1500), notes: 'Customer shifted venue' }, ['advance', 'cancel'], 2, 18)
  O({ cust: 'Farhan', items: [['Namkeen Mixture', 8], ['Bhujia Sev', 6]], due: 0, source: 'Phone', kind: 'Bulk', delivery: 'Delivery', advance: adv(2000, 'Cash') }, ['advance', 'advance', 'advance', 'advance'], 1, 12)
  O({ cust: 'Neha', items: [['Bengali Rasgulla', 3], ['Sandesh', 1]], due: 4, advance: adv(300, 'Cash') }, ['advance'], 0, 13)
  O({ cust: 'Raj Traders', items: [['Kaju Katli', 5], ['Motichoor Laddu', 5]], due: 5, source: 'Phone', kind: 'Bulk', delivery: 'Delivery', advance: adv(3000), notes: 'Inter-state supply to Jaipur — IGST applies. Courier arranged.' }, ['advance'], 1, 16)
  // online orders
  O({ cust: 'Sanjana', items: [['Bengali Rasgulla', 1], ['Kaju Katli', 0.5]], due: 0, source: 'Website', delivery: 'Delivery', paymentTerms: 'Prepaid', acceptance: 'Pending', advance: adv(-1), platformRef: 'WEB-24811' }, [], 0, 12)
  O({ cust: 'Vikram', items: [['Assorted Sweet Box', 2]], due: 1, source: 'Website', delivery: 'Delivery', paymentTerms: 'Prepaid', acceptance: 'Pending', advance: adv(-1), platformRef: 'WEB-24812', packaging: 'Gift wrap + card' }, [], 0, 13)
  O({ cust: 'Anita', items: [['Samosa', 10], ['Kachori', 6], ['Aloo Tikki', 6]], due: 0, source: 'Delivery Partner', delivery: 'Delivery', paymentTerms: 'Prepaid', platformRef: 'QB-77120', advance: adv(-1) }, ['accept', 'advance'], 0, 12)
  O({ cust: 'Harish', items: [['Dhokla', 1], ['Namkeen Mixture', 1]], due: 0, source: 'WhatsApp', delivery: 'Delivery', paymentTerms: 'COD' }, ['accept', 'advance', 'advance'], 0, 11)
  O({ cust: 'Meera', items: [['Chamcham', 1], ['Kalakand', 1]], due: 0, source: 'Phone', delivery: 'Delivery', paymentTerms: 'COD' }, ['accept', 'advance', 'advance', 'advance'], 0, 10)
  O({ cust: 'Sunil', items: [['Moong Dal Namkeen', 1], ['Bhujia Sev', 1]], due: -1, source: 'Website', delivery: 'Delivery', paymentTerms: 'Prepaid', advance: adv(-1), platformRef: 'WEB-24790' }, ['accept', 'advance', 'advance', 'advance', 'deliver'], 2, 14)
  O({ cust: 'Neha', items: [['Soan Papdi', 2]], due: 0, source: 'Website', delivery: 'Delivery', paymentTerms: 'Prepaid', advance: adv(-1), platformRef: 'WEB-24805' }, ['reject'], 1, 19)
  // festival orders
  O({
    cust: 'Bharat Tech', items: [['Assorted Sweet Box', 100]], due: 7, source: 'Phone', kind: 'Corporate Gifting', delivery: 'Delivery', discount: 3750, advance: adv(35000), festivalId: 'fes_diwali',
    packaging: 'Custom branded sleeves with company logo, ribbon & greeting card', notes: 'Delivery to Sector V office reception, 11 AM–1 PM. GST invoice on company GSTIN.', deliveryAddress: 'Sector V, Salt Lake Electronics Complex, Kolkata 700091',
  }, ['advance'], 1, 11)
  O({ cust: 'Arjun', items: [['Kaju Katli Gift Box', 25]], due: 6, kind: 'Custom Box', delivery: 'Delivery', advance: adv(6000, 'Cash'), festivalId: 'fes_diwali', packaging: 'Red & gold sleeves, personalised tags' }, ['advance', 'advance', 'advance'], 3, 12)
  O({ cust: 'Shah', items: [['Dry Fruit Premium Box', 40]], due: 8, source: 'Phone', kind: 'Corporate Gifting', delivery: 'Delivery', advance: adv(30000), festivalId: 'fes_diwali', packaging: 'Premium wooden boxes with brass nameplate' }, [], 0, 15)
  O({ cust: 'Kolkata Club', items: [['Kaju Katli', 10], ['Motichoor Laddu', 15], ['Namkeen Mixture', 10]], due: 7, kind: 'Bulk', delivery: 'Delivery', advance: adv(10000), festivalId: 'fes_diwali', packaging: 'Bulk trays, 1 kg packs' }, ['advance'], 2, 16)
  O({ cust: "St. Xavier's", items: [['Assorted Sweet Box', 30]], due: 20, kind: 'Bulk', delivery: 'Pickup', advance: adv(5000, 'Cash'), festivalId: 'fes_xmas', packaging: 'Green & red wrap' }, [], 0, 17)
  O({ cust: 'Gupta Caterers', items: [['Anjeer Roll', 5], ['Pista Barfi', 3]], due: 35, kind: 'Bulk', delivery: 'Delivery', festivalId: 'fes_ny' }, [], 0, 18)
  clearMemo(d)

  /* ---------- daily opening / closing records ---------- */
  for (let off = 7; off >= 1; off--) {
    const day = addDays(today, -off)
    setClock(`${day}T10:0${Math.floor(rnd() * 5)}`)
    opOpenShop(d, { date: day, time: `10:0${Math.floor(rnd() * 5)}`, openingCash: 5000, notes: off === 3 ? 'Float topped up for festival rush' : undefined, checklist: { stock: true, orders: true, attendance: true, expiry: true } })
    setClock(`${day}T22:0${Math.floor(rnd() * 6)}`)
    opCloseShop(d, { date: day, time: `22:0${Math.floor(rnd() * 6)}`, actualCash: 0 })
    const rec = d.days.find((x) => x.date === day)!
    const diff = rnd() < 0.55 ? 0 : Math.round((rnd() * 230 - 150) / 10) * 10
    rec.actualCash = r2((rec.expectedCash || 0) + diff)
    rec.diff = diff
    rec.closeNotes = diff === 0 ? 'Cash tallied. Deposited surplus in bank.' : diff < 0 ? 'Short — change error suspected at counter.' : 'Excess — rounding on cash bills.'
  }
  setClock(null)
  d.days.push({ date: today, openedAt: today + 'T10:02', openedBy: 'Rajesh Kumar', openingCash: 5000, openNotes: 'Shop opened on time. Fresh batches received at 9:30 AM.', checklist: { stock: true, orders: true, attendance: true, expiry: false } })
  void NOW; void fyLabel; void fmtDate; void ({} as Order)
  clearMemo(d)
  return d
}
