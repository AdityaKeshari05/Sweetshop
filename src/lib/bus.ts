// tiny cross-page hand-off (used by the Demo Guide to pre-fill forms)
export const bus: { posPreset: null | { items: { name: string; qty: number }[]; pay?: 'UPI' | 'Cash' | 'Card'; customer?: string }; wastagePreset: null | { product: string; expired: boolean }; receivePO: string | null; festivalOrder: boolean } = {
  posPreset: null, wastagePreset: null, receivePO: null, festivalOrder: false,
}
