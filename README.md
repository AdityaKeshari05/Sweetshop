# Shree Mishtanna Bhandar — Sweet Shop ERP / POS (client demo)

A fully interactive demo of a sweet-shop management system for an Indian sweets & snacks retailer: POS billing, batch/expiry inventory, wastage, suppliers, orders (customer / online / festival), staff, GST invoices, cash reconciliation, P&L and reports.

Everything runs in the browser with a local mock data layer (localStorage). No backend, API keys, payment gateway or GST integration is required.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build: `npm run build && npm run preview`.

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, Recharts, lucide-react.

## Roles (no password — demo switcher)

Use the profile menu (top-right) to switch roles. Locked menu items are dimmed; restricted pages show an "Access restricted" screen; sensitive buttons are disabled.

| Role | Can access |
|---|---|
| **Owner / Admin** | Everything, incl. Profit & Loss, Settings & Roles, reset demo |
| **Manager** | POS, sales, customers, orders, online & festival orders, inventory, expiry, suppliers (incl. payments), payments, expenses, GST, operations, staff, reports (not P&L / settings) |
| **Cashier** | POS, invoices (print), customers, payments & dues. Discounts > 10% are blocked; refunds/cancellations need a Manager |
| **Inventory Staff** | Inventory, batches, expiry & wastage, suppliers / purchase orders / goods receipt (cannot pay suppliers) |

Full matrix: *Settings & Roles* page.

## Guided demo

Open **Demo Guide** (sidebar). Six scenarios have one-click entry points:

- **A** Morning opening — Shop Operations (today is pre-opened at 10:02 AM; use *Reopen* after closing to replay)
- **B** Walk-in UPI sale — loads 500 g Kaju Katli + 1 kg Motichoor Laddu into POS with UPI selected
- **C** Expired Rasmalai → wastage form pre-filled with the expired batch
- **D** PO-0001 from Shree Dairy Suppliers → goods-received dialog, then pay part of the invoice
- **E** Diwali corporate order — 100 Assorted Sweet Boxes (ORD-0020) with ₹35,000 advance; move it Confirmed → Preparing → Ready → Dispatched → Delivered
- **F** Daily closing — expected vs counted cash, shortage/excess, printable summary

## Demo data

Generated deterministically relative to **today** (re-generated automatically on a new calendar day so "Today" is never empty):

26 products (7 categories) with batches, expiries, an out-of-stock and several low-stock/expired items · 5 staff with 40 days of attendance · 19 customers (corporate, one inter-state in Rajasthan) · 5 suppliers (one inter-state) with purchase invoices, part-payments and overdue dues · ~570 sales over 35 days (cash/UPI/card/split/credit) · 25 orders (customer, online with 2 pending decisions, festival) · daily expenses · wastage · 7 days of opening/closing records.

Festival dates are demo values (Diwali = today + 9 days); edit them in the Festival module.

## Reset the demo

Settings & Roles → **Reset demo data** (Owner only), or Demo Guide → Reset. Data otherwise persists across refreshes in this browser (localStorage key `smb-erp-demo-v3`).

## Modules

Dashboard (date filters, 10 KPIs, charts, alerts) · Demo Guide · POS Billing (weights in grams, pieces, boxes, discounts, GST, split / credit payments, simulated UPI QR, printable invoice) · Sales & Invoices (cancel, partial refund, restock) · Customers (history, credit, dues) · Customer Orders · Online Orders (accept/reject, lifecycle, "simulate incoming order") · Festival Orders · Inventory & Stock (product master, batches, ledger, adjustments, location transfer) · Expiry & Wastage (FEFO) · Suppliers & Purchases (PO → GRN → invoice → payments) · Payments & Cash (UPI records, cash register, refunds) · Expenses · Profit & Loss · GST & Tax (per-product rates, invoices, registers) · Shop Operations · Staff & Attendance · Reports (20 reports, CSV export) · Settings & Roles.

## How the numbers work (accounting assumptions)

- Revenue = net sales **excluding GST**; GST is shown as a liability, separate from profit.
- COGS = actual batch cost of stock sold (FEFO allocation saved on each invoice line). Returned & restocked items reverse COGS.
- Purchases increase inventory (at cost ex-GST); they are never expensed on receipt. Non-stock purchases (packaging) are booked as expenses on receipt.
- Wastage cost, daily-allocated salaries & rent, and recorded expenses sit below gross profit.
- Orders deduct stock **once** when preparation starts; cancelling releases it. Items are locked after that. Revenue and the GST invoice are recognised on delivery.
- Cash, receivables, payables, inventory value, gross profit and operating profit are shown side-by-side on the P&L page so they are not confused.

## Known limitations

- Demo only: UPI/card references are generated locally; GST rates/HSN are editable sample values; tax registers are illustrative, **not** filed returns or certified compliance.
- Single browser, single user session (roles are a switcher, no authentication). Clearing site data wipes the demo.
- Day boundaries use Asia/Kolkata for "today"; no multi-outlet UI (data model has locations and a transfer flow).
- Invoice printing uses the browser print dialog (A4 layout); thermal-printer formats are not included.
- No automated test suite; behaviour was verified with scripted end-to-end checks against the store (sales, refunds, cancellations, wastage, purchases, orders, closing, persistence, reset).
