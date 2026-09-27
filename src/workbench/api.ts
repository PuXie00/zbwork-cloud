import type {
  CustomerGetResult,
  CustomerListResult,
  DailyRecord,
  PageId,
  ReplyHabit,
  SaveHabitInput,
  SaveRecordInput,
  SaveScriptInput,
  Script,
  Settings,
  SettingsPatch,
  TodaySnapshot,
} from '../../electron/workbench/types'

export interface WorkbenchApi {
  getToday: () => Promise<TodaySnapshot>
  getRecord: (date: string) => Promise<DailyRecord | null>
  saveRecord: (input: SaveRecordInput) => Promise<DailyRecord>
  listRecords: (from: string, to: string) => Promise<DailyRecord[]>
  markReviewed: (date: string) => Promise<DailyRecord>
  listScripts: (includeDisabled: boolean) => Promise<Script[]>
  saveScript: (input: SaveScriptInput) => Promise<Script>
  disableScript: (id: string) => Promise<void>
  listHabits: () => Promise<ReplyHabit[]>
  saveHabit: (input: SaveHabitInput) => Promise<ReplyHabit>
  deleteHabit: (id: string) => Promise<void>
  listCustomers: (query?: string) => Promise<CustomerListResult>
  getCustomer: (id: string) => Promise<CustomerGetResult>
  draftCrmNote: (input: { date?: string; customerId?: string }) => Promise<{ text: string }>
  getSettings: () => Promise<Settings>
  saveSettings: (patch: SettingsPatch) => Promise<Settings>
  getMcpStatus: () => Promise<{ running: boolean; port: number; error: string | null }>
  copyText: (text: string) => Promise<void>
  onOpen: (cb: (page: PageId) => void) => () => void
}

export function getWorkbench(): WorkbenchApi {
  if (!window.workbench) throw new Error('请在 Electron 工作台中打开')
  return window.workbench
}
