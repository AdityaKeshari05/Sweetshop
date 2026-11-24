import { useSyncExternalStore } from 'react'
import type { State } from './types'
import { buildSeed } from './seed'
import { clearMemo } from './calc'
import * as ops from './ops'
import { todayStr } from './util'

const KEY = 'smb-erp-demo-v3'
const VERSION = 3

function load(): State {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (raw) {
      const s = JSON.parse(raw) as State
      // Demo data is generated relative to "today": refresh automatically on a new day (keeps the demo alive).
      if (s.version === VERSION && s.seedDate === todayStr()) return s
      return buildSeed(s.userId)
    }
  } catch {
    /* fall through */
  }
  return buildSeed()
}

let state: State = load()
persist()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Could not persist state', e)
  }
}

export const getState = () => state
export const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
export const useStore = (): State => useSyncExternalStore(subscribe, getState)

function commit<T>(fn: (d: State) => T): T {
  const d = structuredClone(state)
  const r = fn(d) // may throw → state untouched
  clearMemo(d)
  state = d
  persist()
  listeners.forEach((l) => l())
  return r
}

type Ops = typeof ops
type Wrapped<T> = { [K in keyof T as K extends `op${string}` ? K : never]: T[K] extends (d: State, ...a: infer A) => infer R ? (...a: A) => R : never }
const wrapped: Record<string, any> = {}
for (const [k, f] of Object.entries(ops)) {
  if (k.startsWith('op') && typeof f === 'function') wrapped[k.slice(2, 3).toLowerCase() + k.slice(3)] = (...a: any[]) => commit((d) => (f as any)(d, ...a))
}
type Act = { [K in keyof Wrapped<Ops> as K extends `op${infer R}` ? `${Uncapitalize<R>}` : never]: Wrapped<Ops>[K] }
export const act = wrapped as Act

export const actions = {
  setUser: (id: string) => commit((d) => { d.userId = id }),
  updateSettings: (patch: Partial<State['settings']>) => commit((d) => { Object.assign(d.settings, patch) }),
  resetDemo: () => commit((d) => { Object.assign(d, buildSeed(d.userId)) }),
  deleteFestival: (id: string) => commit((d) => {
    if (d.orders.some((o) => o.festivalId === id)) throw new Error('Festival has orders and cannot be deleted')
    d.festivals = d.festivals.filter((f) => f.id !== id)
  }),
  deleteStaff: (id: string) => commit((d) => { const s = d.staff.find((x) => x.id === id); if (s) s.active = false }),
  toggleProductFlag: (id: string) => commit((d) => { const p = d.products.find((x) => x.id === id); if (p) p.archived = !p.archived }),
}

export const currentUser = (s: State) => s.users.find((u) => u.id === s.userId)!

if (import.meta.env.DEV) (window as any).__smb = { getState, act, actions }
