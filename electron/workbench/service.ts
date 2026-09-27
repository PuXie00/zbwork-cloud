import { randomUUID } from 'node:crypto'
import { formatCrmNote } from './draft'
import { cachedCustomers, type FetchLike, SilverbeneClient } from './crm'
import { queryAll, queryOne, WorkbenchDb } from './db'
import { dueReminders, type DueReminder } from './reminders'
import { addDays, assertDate, assertHm, formatMinutes, parseHm, shanghaiClock } from './time'
import {
  SCENES,
  type Customer,
  type CustomerGetResult,
  type CustomerListResult,
  type DailyRecord,
  type KnowledgeHit,
  type MetalPrice,
  type OpenLead,
  type ProjectInquiry,
  type ReplyHabit,
  type SalesProject,
  type SaveHabitInput,
  type SaveRecordInput,
  type SaveScriptInput,
  type Scene,
  type Script,
  type Settings,
  type SettingsPatch,
  type TodaySnapshot,
} from './types'

function text(value: string | number | null | undefined): string {
  return value == null ? '' : String(value)
}

function asScene(value: string): Scene {
  if ((SCENES as readonly string[]).includes(value)) return value as Scene
  throw new Error(`场景只能是：${SCENES.join('、')}`)
}

function mapRecord(row: Record<string, string | number | null>): DailyRecord {
  let customerIds: string[] = []
  try {
    const parsed = JSON.parse(text(row.customer_ids) || '[]') as unknown
    if (Array.isArray(parsed)) customerIds = parsed.map(item => String(item)).filter(Boolean)
  } catch {
    customerIds = []
  }
  return {
    date: text(row.record_date),
    customerIds,
    customerNames: text(row.customer_names),
    progress: text(row.progress),
    pending: text(row.pending),
    tomorrow: text(row.tomorrow),
    notes: text(row.notes),
    savedAt: text(row.saved_at),
    reviewedAt: row.reviewed_at == null || row.reviewed_at === '' ? null : text(row.reviewed_at),
  }
}

function mapScript(row: Record<string, string | number | null>): Script {
  return {
    id: text(row.id),
    scene: asScene(text(row.scene)),
    title: text(row.title),
    body: text(row.body),
    tags: text(row.tags),
    enabled: Number(row.enabled) === 1,
    updatedAt: text(row.updated_at),
  }
}

function mapHabit(row: Record<string, string | number | null>): ReplyHabit {
  return {
    id: text(row.id),
    scene: asScene(text(row.scene)),
    structure: text(row.structure),
    example: text(row.example),
    updatedAt: text(row.updated_at),
  }
}

export class Workbench {
  private customerListAt = 0
  private customerListQuery = ''
  private customerListResult: CustomerListResult | null = null

  private readonly cloud: SilverbeneClient

  private constructor(
    private readonly store: WorkbenchDb,
    fetchImpl: FetchLike,
  ) {
    this.cloud = new SilverbeneClient(store, fetchImpl, () => this.getSettings())
  }

  static async open(filename: string, fetchImpl: FetchLike = fetch): Promise<Workbench> {
    const store = await WorkbenchDb.open(filename)
    return new Workbench(store, fetchImpl)
  }

  close(): void {
    this.store.close()
  }

  private setting(key: string): string {
    const row = queryOne(this.store.db, 'SELECT value FROM settings WHERE key = ?', [key])
    return text(row?.value)
  }

  private putSetting(key: string, value: string): void {
    this.store.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    )
  }

  getSettings(): Settings {
    return {
      mcpPort: Number(this.setting('mcp_port')) || 3737,
      mcpToken: this.setting('mcp_token'),
      mcpEnabled: this.setting('mcp_enabled') !== '0',
      crmBaseUrl: this.setting('crm_base_url') || 'https://admin.silverbene.com',
      crmUsername: this.setting('crm_username'),
      crmPassword: this.setting('crm_password'),
      crmTimeoutMs: Number(this.setting('crm_timeout_ms')) || 8000,
      remindWriteFirst: this.setting('remind_write_first') || '16:00',
      remindWriteSecond: this.setting('remind_write_second') || '17:00',
      remindReview: this.setting('remind_review') || '10:00',
      openAtLogin: this.setting('open_at_login') === '1',
    }
  }

  updateSettings(patch: SettingsPatch): Settings {
    const previous = this.getSettings()
    if (patch.mcpPort != null) {
      if (!Number.isInteger(patch.mcpPort) || patch.mcpPort < 1 || patch.mcpPort > 65535) {
        throw new Error('MCP 端口需为 1 到 65535 的整数')
      }
      this.putSetting('mcp_port', String(patch.mcpPort))
    }
    if (patch.mcpToken != null) {
      if (patch.mcpToken.trim().length < 16) throw new Error('MCP token 至少 16 位')
      this.putSetting('mcp_token', patch.mcpToken.trim())
    }
    if (patch.mcpEnabled != null) this.putSetting('mcp_enabled', patch.mcpEnabled ? '1' : '0')
    if (patch.crmBaseUrl != null) this.putSetting('crm_base_url', patch.crmBaseUrl.trim())
    if (patch.crmUsername != null) this.putSetting('crm_username', patch.crmUsername.trim())
    if (patch.crmPassword != null) this.putSetting('crm_password', patch.crmPassword)
    if (patch.crmTimeoutMs != null) {
      if (!Number.isInteger(patch.crmTimeoutMs) || patch.crmTimeoutMs < 1000 || patch.crmTimeoutMs > 60000) {
        throw new Error('超时需为 1000 到 60000 毫秒')
      }
      this.putSetting('crm_timeout_ms', String(patch.crmTimeoutMs))
    }
    if (patch.remindWriteFirst != null) this.putSetting('remind_write_first', assertHm(patch.remindWriteFirst))
    if (patch.remindWriteSecond != null) this.putSetting('remind_write_second', assertHm(patch.remindWriteSecond))
    if (patch.remindReview != null) this.putSetting('remind_review', assertHm(patch.remindReview))
    if (patch.openAtLogin != null) this.putSetting('open_at_login', patch.openAtLogin ? '1' : '0')
    const next = this.getSettings()
    const credentialsChanged = next.crmUsername !== previous.crmUsername
      || next.crmPassword !== previous.crmPassword
      || next.crmBaseUrl !== previous.crmBaseUrl
    if (credentialsChanged) this.cloud.invalidate()
    this.customerListResult = null
    this.store.persist()
    return next
  }

  getRecord(date: string): DailyRecord | null {
    const row = queryOne(this.store.db, 'SELECT * FROM daily_records WHERE record_date = ?', [assertDate(date)])
    return row ? mapRecord(row) : null
  }

  saveRecord(input: SaveRecordInput): DailyRecord {
    const date = assertDate(input.date)
    const customerIds = (input.customerIds ?? []).map(id => id.trim()).filter(Boolean)
    const customerNames = (input.customerNames ?? '').trim()
    const progress = (input.progress ?? '').trim()
    const pending = (input.pending ?? '').trim()
    const tomorrow = (input.tomorrow ?? '').trim()
    const notes = (input.notes ?? '').trim()
    if (customerIds.length === 0 && !customerNames && !progress && !pending && !tomorrow && !notes) {
      throw new Error('记录是空的，写一点再保存')
    }
    const existing = this.getRecord(date)
    const savedAt = new Date().toISOString()
    this.store.db.run(
      `INSERT INTO daily_records
        (record_date, customer_ids, customer_names, progress, pending, tomorrow, notes, saved_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(record_date) DO UPDATE SET
        customer_ids = excluded.customer_ids,
        customer_names = excluded.customer_names,
        progress = excluded.progress,
        pending = excluded.pending,
        tomorrow = excluded.tomorrow,
        notes = excluded.notes,
        saved_at = excluded.saved_at`,
      [date, JSON.stringify(customerIds), customerNames, progress, pending, tomorrow, notes, savedAt, existing?.reviewedAt ?? null],
    )
    this.store.persist()
    const saved = this.getRecord(date)
    if (!saved) throw new Error('保存每日记录失败')
    return saved
  }

  listRecords(from: string, to: string): DailyRecord[] {
    const start = assertDate(from)
    const end = assertDate(to)
    return queryAll(
      this.store.db,
      'SELECT * FROM daily_records WHERE record_date >= ? AND record_date <= ? ORDER BY record_date DESC',
      [start, end],
    ).map(mapRecord)
  }

  markReviewed(date: string): DailyRecord {
    const recordDate = assertDate(date)
    const existing = this.getRecord(recordDate)
    if (!existing) throw new Error('这一天没有工作记录')
    this.store.db.run('UPDATE daily_records SET reviewed_at = ? WHERE record_date = ?', [new Date().toISOString(), recordDate])
    this.store.persist()
    const saved = this.getRecord(recordDate)
    if (!saved) throw new Error('标记已查看失败')
    return saved
  }

  listScripts(includeDisabled = false): Script[] {
    const sql = includeDisabled
      ? 'SELECT * FROM scripts ORDER BY updated_at DESC'
      : 'SELECT * FROM scripts WHERE enabled = 1 ORDER BY updated_at DESC'
    return queryAll(this.store.db, sql).map(mapScript)
  }

  getScript(id: string): Script | null {
    const row = queryOne(this.store.db, 'SELECT * FROM scripts WHERE id = ?', [id])
    return row ? mapScript(row) : null
  }

  saveScript(input: SaveScriptInput): Script {
    const scene = asScene(input.scene)
    const title = input.title.trim()
    const body = input.body.trim()
    if (!title || !body) throw new Error('话术需要标题和正文')
    const id = input.id?.trim() || randomUUID()
    const updatedAt = new Date().toISOString()
    const existing = this.getScript(id)
    this.store.db.run(
      `INSERT INTO scripts (id, scene, title, body, tags, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        scene = excluded.scene,
        title = excluded.title,
        body = excluded.body,
        tags = excluded.tags,
        updated_at = excluded.updated_at`,
      [id, scene, title, body, (input.tags ?? '').trim(), existing ? (existing.enabled ? 1 : 0) : 1, updatedAt],
    )
    this.store.persist()
    const saved = this.getScript(id)
    if (!saved) throw new Error('保存话术失败')
    return saved
  }

  disableScript(id: string): void {
    const existing = this.getScript(id)
    if (!existing) throw new Error('没有这条话术')
    this.store.db.run('UPDATE scripts SET enabled = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), id])
    this.store.persist()
  }

  listHabits(scene?: string): ReplyHabit[] {
    if (!scene) return queryAll(this.store.db, 'SELECT * FROM reply_habits ORDER BY updated_at DESC').map(mapHabit)
    return queryAll(this.store.db, 'SELECT * FROM reply_habits WHERE scene = ? ORDER BY updated_at DESC', [asScene(scene)]).map(mapHabit)
  }

  saveHabit(input: SaveHabitInput): ReplyHabit {
    const scene = asScene(input.scene)
    const structure = input.structure.trim()
    const example = input.example.trim()
    if (!structure || !example) throw new Error('回复习惯需要结构说明和例句')
    const id = input.id?.trim() || randomUUID()
    const updatedAt = new Date().toISOString()
    this.store.db.run(
      `INSERT INTO reply_habits (id, scene, structure, example, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        scene = excluded.scene,
        structure = excluded.structure,
        example = excluded.example,
        updated_at = excluded.updated_at`,
      [id, scene, structure, example, updatedAt],
    )
    this.store.persist()
    const row = queryOne(this.store.db, 'SELECT * FROM reply_habits WHERE id = ?', [id])
    if (!row) throw new Error('保存回复习惯失败')
    return mapHabit(row)
  }

  deleteHabit(id: string): void {
    const row = queryOne(this.store.db, 'SELECT id FROM reply_habits WHERE id = ?', [id])
    if (!row) throw new Error('没有这条回复习惯')
    this.store.db.run('DELETE FROM reply_habits WHERE id = ?', [id])
    this.store.persist()
  }

  searchKnowledge(input: { scene?: string; customer?: string; query?: string }): KnowledgeHit {
    let scripts = this.listScripts(false)
    let habits = this.listHabits()
    if (input.scene?.trim()) {
      const scene = asScene(input.scene.trim())
      scripts = scripts.filter(item => item.scene === scene)
      habits = habits.filter(item => item.scene === scene)
    }
    const needles = [input.query, input.customer].map(item => item?.trim().toLowerCase()).filter((item): item is string => Boolean(item))
    if (needles.length > 0) {
      scripts = scripts.filter(item => needles.every(needle => `${item.title}\n${item.body}\n${item.tags}\n${item.scene}`.toLowerCase().includes(needle)))
      habits = habits.filter(item => needles.every(needle => `${item.structure}\n${item.example}\n${item.scene}`.toLowerCase().includes(needle)))
    }
    return { scripts, habits }
  }

  async listCustomers(query = ''): Promise<CustomerListResult> {
    if (!this.cloud.configured()) return { configured: false, source: 'unconfigured', customers: [] }
    const now = Date.now()
    if (
      this.customerListResult
      && this.customerListQuery === query
      && this.customerListResult.source === 'live'
      && now - this.customerListAt < 60_000
    ) {
      return this.customerListResult
    }
    try {
      const customers = await this.cloud.listCustomers(query)
      const result: CustomerListResult = { configured: true, source: 'live', customers }
      this.customerListAt = now
      this.customerListQuery = query
      this.customerListResult = result
      return result
    } catch (error) {
      const cached = cachedCustomers(this.store).filter(customer => customerMatches(customer, query))
      const message = error instanceof Error ? error.message : '云端客户读取失败'
      if (cachedCustomers(this.store).length > 0) {
        return { configured: true, source: 'cache', customers: cached, message }
      }
      return { configured: true, source: 'error', customers: [], message }
    }
  }

  async getCustomer(id: string): Promise<CustomerGetResult> {
    const customerId = id.trim()
    if (!customerId) return { configured: this.cloud.configured(), source: 'error', customer: null, message: '缺少客户 id' }
    if (!this.cloud.configured()) return { configured: false, source: 'unconfigured', customer: null }
    try {
      const customer = await this.cloud.getCustomer(customerId)
      if (!customer) return { configured: true, source: 'error', customer: null, message: '云端没有这个客户' }
      return { configured: true, source: 'live', customer }
    } catch (error) {
      const cached = cachedCustomers(this.store).find(customer => customer.id === customerId) ?? null
      const message = error instanceof Error ? error.message : '云端客户读取失败'
      if (cached) return { configured: true, source: 'cache', customer: cached, message }
      return { configured: true, source: 'error', customer: null, message }
    }
  }

  async listProjects(): Promise<SalesProject[]> {
    if (!this.cloud.configured()) return []
    return this.cloud.listProjects()
  }

  async listLeads(): Promise<OpenLead[]> {
    if (!this.cloud.configured()) return []
    return this.cloud.listLeads()
  }

  async listMetals(): Promise<MetalPrice[]> {
    if (!this.cloud.configured()) return []
    return this.cloud.listMetals()
  }

  async getProjectInquiry(projectId: string): Promise<ProjectInquiry | null> {
    if (!this.cloud.configured()) return null
    return this.cloud.getProjectInquiry(projectId)
  }

  async draftCrmNote(input: { date?: string; customerId?: string } = {}): Promise<{ text: string }> {
    const clock = shanghaiClock(new Date())
    const date = assertDate(input.date ?? addDays(clock.date, -1))
    const record = this.getRecord(date)
    const customerId = input.customerId?.trim()
    if (!customerId) return { text: formatCrmNote({ date, record, customer: null }) }
    const result = await this.getCustomer(customerId)
    return {
      text: formatCrmNote({
        date,
        record,
        customer: result.customer,
        customerMissingId: result.customer ? undefined : customerId,
      }),
    }
  }

  async todaySnapshot(now = new Date()): Promise<TodaySnapshot> {
    const clock = shanghaiClock(now)
    const settings = this.getSettings()
    const reviewAt = settings.remindReview
    const yesterdayDate = addDays(clock.date, -1)
    const customers = await this.listCustomers()
    const cloud = await this.cloudSnapshot()
    return {
      date: clock.date,
      timeLabel: formatMinutes(clock.minutes),
      reviewAt,
      reviewVisible: clock.minutes >= parseHm(reviewAt, '10:00'),
      today: this.getRecord(clock.date),
      yesterdayDate,
      yesterday: this.getRecord(yesterdayDate),
      customers,
      projects: cloud.projects,
      leads: cloud.leads,
      metals: cloud.metals,
    }
  }

  private async cloudSnapshot(): Promise<{ projects: SalesProject[]; leads: OpenLead[]; metals: MetalPrice[] }> {
    if (!this.cloud.configured()) return { projects: [], leads: [], metals: [] }
    const [projects, leads, metals] = await Promise.allSettled([
      this.cloud.listProjects(),
      this.cloud.listLeads(),
      this.cloud.listMetals(),
    ])
    return {
      projects: projects.status === 'fulfilled' ? projects.value : [],
      leads: leads.status === 'fulfilled' ? leads.value : [],
      metals: metals.status === 'fulfilled' ? metals.value : [],
    }
  }

  pendingReminders(now = new Date()): DueReminder[] {
    const clock = shanghaiClock(now)
    const settings = this.getSettings()
    const yesterday = this.getRecord(addDays(clock.date, -1))
    const firedRows = queryAll(this.store.db, 'SELECT fire_key FROM reminder_fires WHERE fire_key LIKE ?', [`${clock.date}:%`])
    return dueReminders({
      clock,
      writeFirst: settings.remindWriteFirst,
      writeSecond: settings.remindWriteSecond,
      reviewAt: settings.remindReview,
      todaySaved: this.getRecord(clock.date) !== null,
      yesterdayExists: yesterday !== null,
      yesterdayReviewed: yesterday?.reviewedAt != null,
      fired: new Set(firedRows.map(row => text(row.fire_key))),
    })
  }

  acknowledgeReminder(fireKey: string): void {
    this.store.db.run(
      'INSERT INTO reminder_fires (fire_key, fired_at) VALUES (?, ?) ON CONFLICT(fire_key) DO NOTHING',
      [fireKey, new Date().toISOString()],
    )
    this.store.persist()
  }

  knowledgeSummary(): { enabledScripts: number; habits: number; scenes: readonly string[] } {
    return {
      enabledScripts: this.listScripts(false).length,
      habits: this.listHabits().length,
      scenes: SCENES,
    }
  }
}

function customerMatches(customer: Customer, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${customer.name} ${customer.company} ${customer.email} ${customer.country}`.toLowerCase().includes(needle)
}
