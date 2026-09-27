export const SCENES = ['新询盘', '报价', '跟进', '样品', 'PI/付款', '交期', '售后'] as const

export type Scene = (typeof SCENES)[number]

export type DailyRecord = {
  date: string
  customerIds: string[]
  customerNames: string
  progress: string
  pending: string
  tomorrow: string
  notes: string
  savedAt: string
  reviewedAt: string | null
}

export type SaveRecordInput = {
  date: string
  customerIds?: string[]
  customerNames?: string
  progress?: string
  pending?: string
  tomorrow?: string
  notes?: string
}

export type Script = {
  id: string
  scene: Scene
  title: string
  body: string
  tags: string
  enabled: boolean
  updatedAt: string
}

export type SaveScriptInput = {
  id?: string
  scene: string
  title: string
  body: string
  tags?: string
}

export type ReplyHabit = {
  id: string
  scene: Scene
  structure: string
  example: string
  updatedAt: string
}

export type SaveHabitInput = {
  id?: string
  scene: string
  structure: string
  example: string
}

export type Customer = {
  id: string
  name: string
  company: string
  email: string
  country: string
  source: string
}

export type SalesProject = {
  id: string
  name: string
  customerName: string
  email: string
  stage: string
  updatedAt: string
}

export type OpenLead = {
  id: string
  name: string
  source: string
  need: string
  productType: string
  country: string
}

export type MetalPrice = {
  code: string
  purity: string
  priceCnyPerG: string
  quotedAt: string
}

export type ProjectInquiry = {
  projectId: string
  inquiryNo: string
  customerName: string
  productType: string
  metal: string
  quantity: string
  language: string
  message: string
  summary: string
}

export type CustomerSource = 'unconfigured' | 'live' | 'cache' | 'error'

export type CustomerListResult = {
  configured: boolean
  source: CustomerSource
  customers: Customer[]
  message?: string
}

export type CustomerGetResult = {
  configured: boolean
  source: CustomerSource
  customer: Customer | null
  message?: string
}

export type Settings = {
  mcpPort: number
  mcpToken: string
  mcpEnabled: boolean
  crmBaseUrl: string
  crmUsername: string
  crmPassword: string
  crmTimeoutMs: number
  remindWriteFirst: string
  remindWriteSecond: string
  remindReview: string
  openAtLogin: boolean
}

export type SettingsPatch = Partial<Settings>

export type TodaySnapshot = {
  date: string
  timeLabel: string
  reviewAt: string
  reviewVisible: boolean
  today: DailyRecord | null
  yesterdayDate: string
  yesterday: DailyRecord | null
  customers: CustomerListResult
  projects: SalesProject[]
  leads: OpenLead[]
  metals: MetalPrice[]
}

export type KnowledgeHit = {
  scripts: Script[]
  habits: ReplyHabit[]
}

export type PageId = 'home' | 'record' | 'customers' | 'knowledge' | 'settings'
