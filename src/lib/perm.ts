import { useEffect, useState } from 'react'
import type { Role } from './types'

export interface NavItem { id: string; label: string; group: string; roles: Role[] }
const ALL: Role[] = ['Owner', 'Manager', 'Cashier', 'Inventory']
const OM: Role[] = ['Owner', 'Manager']
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', roles: ALL },
  { id: 'guide', label: 'Demo Guide', group: 'Overview', roles: ALL },
  { id: 'pos', label: 'POS Billing', group: 'Sales', roles: ['Owner', 'Manager', 'Cashier'] },
  { id: 'sales', label: 'Sales & Invoices', group: 'Sales', roles: ['Owner', 'Manager', 'Cashier'] },
  { id: 'customers', label: 'Customers', group: 'Sales', roles: ['Owner', 'Manager', 'Cashier'] },
  { id: 'orders', label: 'Customer Orders', group: 'Sales', roles: OM },
  { id: 'online', label: 'Online Orders', group: 'Sales', roles: OM },
  { id: 'festival', label: 'Festival Orders', group: 'Sales', roles: OM },
  { id: 'inventory', label: 'Inventory & Stock', group: 'Stock', roles: ['Owner', 'Manager', 'Inventory'] },
  { id: 'expiry', label: 'Expiry & Wastage', group: 'Stock', roles: ['Owner', 'Manager', 'Inventory'] },
  { id: 'suppliers', label: 'Suppliers & Purchases', group: 'Stock', roles: ['Owner', 'Manager', 'Inventory'] },
  { id: 'payments', label: 'Payments & Cash', group: 'Finance', roles: ['Owner', 'Manager', 'Cashier'] },
  { id: 'expenses', label: 'Expenses', group: 'Finance', roles: OM },
  { id: 'pnl', label: 'Profit & Loss', group: 'Finance', roles: ['Owner'] },
  { id: 'gst', label: 'GST & Tax', group: 'Finance', roles: OM },
  { id: 'operations', label: 'Shop Operations', group: 'Management', roles: OM },
  { id: 'staff', label: 'Staff & Attendance', group: 'Management', roles: OM },
  { id: 'reports', label: 'Reports', group: 'Management', roles: OM },
  { id: 'settings', label: 'Settings & Roles', group: 'Admin', roles: ['Owner'] },
]
export const canAccess = (role: Role, id: string) => !!NAV.find((n) => n.id === id)?.roles.includes(role)

const ACTIONS: Record<string, Role[]> = {
  refund: OM, cancelSale: OM, editProduct: ['Owner', 'Manager', 'Inventory'], deleteProduct: OM, adjustStock: ['Owner', 'Manager', 'Inventory'],
  wastage: ['Owner', 'Manager', 'Inventory'], createPO: ['Owner', 'Manager', 'Inventory'], receivePO: ['Owner', 'Manager', 'Inventory'], paySupplier: OM,
  receiveDue: ['Owner', 'Manager', 'Cashier'], manageStaff: OM, financials: ['Owner'], editSupplier: ['Owner', 'Manager', 'Inventory'], editCustomer: ['Owner', 'Manager', 'Cashier'],
  editGst: OM, costPrice: ['Owner', 'Manager', 'Inventory'], reset: ['Owner'],
}
export const can = (role: Role, action: string) => (ACTIONS[action] || ['Owner']).includes(role)
export const ACTION_LABELS: [string, string][] = [
  ['refund', 'Cancel invoices / issue refunds'], ['editProduct', 'Edit products & prices'], ['adjustStock', 'Stock adjustments & transfers'], ['wastage', 'Record wastage'],
  ['createPO', 'Create purchase orders / receive goods'], ['paySupplier', 'Pay suppliers'], ['receiveDue', 'Receive customer dues'], ['manageStaff', 'Manage staff'], ['financials', 'View profit & loss'], ['reset', 'Reset demo data'],
]

/* hash router: #/page?key=val */
function parse() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  return { path: path || 'dashboard', query: Object.fromEntries(new URLSearchParams(qs || '')) as Record<string, string> }
}
export function useRoute() {
  const [r, setR] = useState(parse)
  useEffect(() => {
    const h = () => setR(parse())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return r
}
export const go = (path: string, query?: Record<string, string>) => {
  window.location.hash = '/' + path + (query ? '?' + new URLSearchParams(query).toString() : '')
}
