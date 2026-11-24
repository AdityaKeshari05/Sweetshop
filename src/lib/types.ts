export type Role = 'Owner' | 'Manager' | 'Cashier' | 'Inventory'
export type Unit = 'kg' | 'pc' | 'box'
export type PayMode = 'Cash' | 'UPI' | 'Card'
export type Supply = 'intra' | 'inter'

export const CATEGORIES = ['Milk Sweets', 'Bengali Sweets', 'Dry Fruit Sweets', 'Traditional Sweets', 'Snacks', 'Namkeen', 'Gift Boxes'] as const

export interface Settings {
  businessName: string
  legalName: string
  gstin: string
  fssai: string
  address: string
  state: string
  stateCode: string
  phone: string
  upiId: string
  openTime: string // HH:mm
  closeTime: string
  lateGraceMin: number
  pricesIncludeGst: boolean
  monthlyRent: number
  currency: string
}

export interface Location { id: string; name: string }

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unit: Unit
  purchasePrice: number
  sellPrice: number
  gstRate: number
  hsn: string
  minStock: number
  supplierId?: string
  shelfLife: number
  archived?: boolean
}

export interface Batch {
  id: string
  productId: string
  batchNo: string
  produced: string
  received: string
  expiry: string
  qty: number
  initialQty: number
  cost: number
  locationId: string
  supplierId?: string
}

export type LedgerType = 'opening' | 'purchase' | 'sale' | 'refund-in' | 'wastage' | 'adjust-in' | 'adjust-out' | 'transfer-in' | 'transfer-out' | 'order-reserve' | 'order-release' | 'cancel-in'
export interface LedgerEntry {
  id: string
  at: string
  productId: string
  batchId?: string
  batchNo?: string
  type: LedgerType
  qty: number // signed
  ref?: string
  note?: string
  locationId: string
  by?: string
}

export interface Alloc { batchId: string; batchNo?: string; qty: number; cost: number; returned?: number }

export interface SaleLine {
  productId: string
  name: string
  unit: Unit
  hsn: string
  gstRate: number
  qty: number
  rate: number
  gross: number // qty*rate as priced
  discount: number // allocated, as priced
  taxable: number
  tax: number
  total: number
  grossEx: number
  discEx: number
  cogs: number
  allocs: Alloc[]
  refundedQty: number
}

export interface Refund {
  id: string
  at: string
  date: string
  lines: { idx: number; qty: number; amount: number; taxable: number; tax: number; cogs: number }[]
  amount: number
  taxable: number
  tax: number
  cogs: number
  restock: boolean
  mode: PayMode | 'Adjust'
  payout: number
  reason: string
  by: string
}

export interface Sale {
  id: string
  invoiceNo: string
  at: string
  date: string
  customerId?: string
  customerName: string
  customerMobile?: string
  customerGstin?: string
  customerState?: string
  supply: Supply
  lines: SaleLine[]
  subtotal: number
  discount: number
  discountNote?: string
  taxable: number
  cgst: number
  sgst: number
  igst: number
  roundOff: number
  total: number
  status: 'Completed' | 'Cancelled'
  source: 'POS' | 'Order'
  orderId?: string
  cashier: string
  refunds: Refund[]
  refundedAmount: number
  note?: string
  cancelReason?: string
}

export interface Payment {
  id: string
  at: string
  date: string
  mode: PayMode
  type: 'receipt' | 'refund'
  amount: number
  ref?: string
  provider?: string
  status: 'Success' | 'Pending' | 'Failed'
  saleId?: string
  orderId?: string
  customerId?: string
  note?: string
  by?: string
}

export interface Customer {
  id: string
  name: string
  mobile: string
  address: string
  email?: string
  notes?: string
  type: 'Walk-in' | 'Regular' | 'Corporate'
  state: string
  gstin?: string
  creditLimit: number
  createdAt: string
}

export const ORDER_STATUSES = ['Received', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const ORDER_SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Website', 'Delivery Partner'] as const
export const ORDER_KINDS = ['Regular', 'Advance', 'Bulk', 'Custom Box', 'Corporate Gifting'] as const

export interface OrderItem { productId: string; name: string; unit: Unit; qty: number; rate: number; gstRate: number; hsn: string }

export interface Order {
  id: string
  orderNo: string
  at: string
  source: (typeof ORDER_SOURCES)[number]
  kind: (typeof ORDER_KINDS)[number]
  customerId: string
  customerName: string
  items: OrderItem[]
  discount: number
  subtotal: number
  total: number
  supply: Supply
  status: OrderStatus
  acceptance: 'Pending' | 'Accepted' | 'Rejected' | 'NA'
  dueDate: string
  dueTime?: string
  delivery: 'Pickup' | 'Delivery'
  deliveryAddress?: string
  notes?: string
  packaging?: string
  festivalId?: string
  paymentTerms: 'Prepaid' | 'COD' | 'Advance'
  stockDeducted: boolean
  allocs: Alloc[][]
  saleId?: string
  history: { at: string; status: string; by: string; note?: string }[]
  cancelReason?: string
  platformRef?: string
}

export interface Festival { id: string; name: string; date: string; active: boolean; notes?: string }

export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
  address: string
  state: string
  gstin: string
  terms: number // days
  supplies: string
}

export interface POItem { productId?: string; name: string; unit: string; qty: number; rate: number; gstRate: number; expenseCat?: string }
export interface PurchaseOrder {
  id: string
  poNo: string
  supplierId: string
  date: string
  expected: string
  items: POItem[]
  status: 'Ordered' | 'Received' | 'Cancelled'
  invoiceId?: string
  notes?: string
}

export interface PurchaseInvoice {
  id: string
  invNo: string
  grnNo: string
  poId?: string
  supplierId: string
  date: string
  dueDate: string
  lines: { productId?: string; name: string; unit: string; qty: number; rate: number; gstRate: number; taxable: number; tax: number; batchNo?: string; expiry?: string }[]
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
}

export interface SupplierPayment {
  id: string
  date: string
  supplierId: string
  amount: number
  mode: PayMode | 'Bank'
  ref?: string
  allocations: { invoiceId: string; amount: number }[]
  by?: string
}

export const EXPENSE_CATS = ['Electricity', 'Gas & Fuel', 'Packaging', 'Staff', 'Transport', 'Maintenance', 'Marketing', 'Other'] as const
export interface Expense { id: string; date: string; category: string; amount: number; mode: PayMode | 'Bank'; note?: string; by?: string; auto?: boolean }

export interface Staff {
  id: string
  name: string
  role: string
  phone: string
  joined: string
  monthlySalary: number
  address?: string
  active: boolean
}
export type AttStatus = 'Present' | 'Absent' | 'Half-day' | 'Leave'
export interface Attendance { id: string; date: string; staffId: string; status: AttStatus; checkIn?: string; checkOut?: string }

export interface Wastage { id: string; date: string; at: string; productId: string; batchId: string; batchNo: string; qty: number; reason: string; cost: number; by: string; note?: string }

export interface DayRecord {
  date: string
  openedAt?: string
  openedBy?: string
  openingCash: number
  openNotes?: string
  checklist: Record<string, boolean>
  closedAt?: string
  closedBy?: string
  expectedCash?: number
  actualCash?: number
  diff?: number
  closeNotes?: string
  summary?: { sales: number; cash: number; upi: number; card: number; refunds: number; discounts: number; wastage: number; bills: number; grossProfit: number; netProfit: number }
}

export interface AppUser { id: string; name: string; role: Role; title: string }

export interface State {
  version: number
  seedDate: string
  userId: string
  settings: Settings
  locations: Location[]
  users: AppUser[]
  products: Product[]
  batches: Batch[]
  ledger: LedgerEntry[]
  sales: Sale[]
  payments: Payment[]
  customers: Customer[]
  orders: Order[]
  festivals: Festival[]
  suppliers: Supplier[]
  pos: PurchaseOrder[]
  purchaseInvoices: PurchaseInvoice[]
  supplierPayments: SupplierPayment[]
  expenses: Expense[]
  staff: Staff[]
  attendance: Attendance[]
  wastage: Wastage[]
  days: DayRecord[]
  counters: { invoice: number; order: number; po: number; grn: number; sku: number; batch: number }
}
