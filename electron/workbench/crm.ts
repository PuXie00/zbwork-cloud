import type { Customer, CustomerGetResult, CustomerListResult, MetalPrice, OpenLead, ProjectInquiry, SalesProject, Settings } from './types'
import { queryAll, queryOne, type WorkbenchDb } from './db'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const DEFAULT_BASE = 'https://admin.silverbene.com'

export function cloudConfigured(settings: Settings): boolean {
  return settings.crmUsername.trim().length > 0 && settings.crmPassword.length > 0
}

function apiUrl(base: string, path: string): string {
  const root = (base.trim() || DEFAULT_BASE).replace(/\/$/, '')
  const prefix = root.endsWith('/api/admin') ? root : `${root}/api/admin`
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

export function mapCustomer(raw: unknown): Customer | null {
  const record = asRecord(raw)
  if (!record || record.id == null || text(record.id).trim() === '') return null
  return {
    id: text(record.id),
    name: text(record.name),
    company: text(record.company),
    email: text(record.email),
    country: text(record.country),
    source: text(record.source),
  }
}

function customerRows(data: unknown): unknown[] {
  const page = asRecord(asRecord(data)?.data)
  const rows = page?.data
  if (Array.isArray(rows)) return rows
  if (Array.isArray(data)) return data
  throw new Error('云端客户列表格式无法识别')
}

function mapProject(raw: unknown): SalesProject | null {
  const record = asRecord(raw)
  if (!record || record.id == null) return null
  const stage = asRecord(record.funnel_stage)
  return {
    id: text(record.id),
    name: text(record.name),
    customerName: text(record.customer_name),
    email: text(record.customer_email),
    stage: text(stage?.stage_label),
    updatedAt: text(record.updated_at),
  }
}

function mapLead(raw: unknown): OpenLead | null {
  const record = asRecord(raw)
  if (!record || record.id == null) return null
  return {
    id: text(record.id),
    name: text(record.name),
    source: text(record.source),
    need: text(record.need),
    productType: text(record.product_type),
    country: text(record.country),
  }
}

function mapMetal(raw: unknown): MetalPrice | null {
  const record = asRecord(raw)
  if (!record || !text(record.metal_code)) return null
  return {
    code: text(record.metal_code),
    purity: text(record.purity),
    priceCnyPerG: text(record.price_rmb_per_g),
    quotedAt: text(record.quoted_at),
  }
}

export function cacheCustomers(store: WorkbenchDb, customers: Customer[], cachedAt: string): void {
  store.db.run('DELETE FROM customer_cache')
  for (const customer of customers) {
    store.db.run(
      'INSERT INTO customer_cache (id, name, company, email, country, source, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [customer.id, customer.name, customer.company, customer.email, customer.country, customer.source, cachedAt],
    )
  }
  store.persist()
}

export function cachedCustomers(store: WorkbenchDb): Customer[] {
  return queryAll(store.db, 'SELECT id, name, company, email, country, source FROM customer_cache ORDER BY name, id').map(row => ({
    id: text(row.id),
    name: text(row.name),
    company: text(row.company),
    email: text(row.email),
    country: text(row.country),
    source: text(row.source),
  }))
}

export class SilverbeneClient {
  private loginFlight: Promise<void> | null = null

  constructor(
    private readonly store: WorkbenchDb,
    private readonly fetchImpl: FetchLike,
    private readonly settings: () => Settings,
  ) {}

  configured(): boolean {
    return cloudConfigured(this.settings())
  }

  invalidate(): void {
    this.writeSetting('crm_access_token', '')
    this.writeSetting('crm_user_id', '')
    this.store.persist()
  }

  async listCustomers(query = ''): Promise<Customer[]> {
    await this.ensureToken(false)
    const ownerId = this.readSetting('crm_user_id')
    const body: Record<string, unknown> = { page: 1, page_size: 100, pool_type: 'private', level: '' }
    if (ownerId) body.owner_id = Number(ownerId)
    const data = await this.post('/xiaoman/customer/list', body)
    const customers = customerRows(data).map(mapCustomer).filter((item): item is Customer => item !== null)
    cacheCustomers(this.store, customers, new Date().toISOString())
    const needle = query.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter(item => `${item.name} ${item.company} ${item.email} ${item.country}`.toLowerCase().includes(needle))
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const data = await this.post('/xiaoman/customer/detail', { id: Number(id) || id })
    return mapCustomer(data)
  }

  async listProjects(): Promise<SalesProject[]> {
    const data = await this.post('/pre_sales_v2/project/funnel-snapshot', {})
    const list = asRecord(data)?.list
    if (!Array.isArray(list)) throw new Error('云端项目列表格式无法识别')
    return list.map(mapProject).filter((item): item is SalesProject => item !== null)
  }

  async listLeads(limit = 20): Promise<OpenLead[]> {
    const data = await this.post('/lky_workbench/leads', { limit })
    const list = asRecord(data)?.list
    if (!Array.isArray(list)) throw new Error('云端线索列表格式无法识别')
    return list.map(mapLead).filter((item): item is OpenLead => item !== null)
  }

  async listMetals(): Promise<MetalPrice[]> {
    const data = await this.post('/lky_oem_pricing_ref/metal/list', {})
    const rows = asRecord(data)?.rows
    if (!Array.isArray(rows)) throw new Error('金属价格格式无法识别')
    return rows.map(mapMetal).filter((item): item is MetalPrice => item !== null)
  }

  async getProjectInquiry(projectId: string): Promise<ProjectInquiry | null> {
    const linked = await this.post('/lky_oem_inquiry/from-project', { project_id: Number(projectId) || projectId })
    const inquiryId = asRecord(asRecord(linked)?.inquiry)?.id
    if (inquiryId == null) return null
    const detail = asRecord(await this.post('/lky_oem_inquiry/detail', { id: inquiryId }))
    if (!detail) return null
    return {
      projectId,
      inquiryNo: text(detail.inquiry_no),
      customerName: text(detail.customer_name),
      productType: text(detail.customer_product_type),
      metal: text(detail.customer_metal_material),
      quantity: text(detail.customer_quantity),
      language: text(detail.customer_language),
      message: text(detail.customer_message),
      summary: text(detail.ai_summary),
    }
  }

  private async post(path: string, body: unknown, allowRetry = true): Promise<unknown> {
    const token = await this.ensureToken(false)
    const response = await this.fetchImpl(apiUrl(this.settings().crmBaseUrl, path), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(this.settings().crmTimeoutMs),
    })
    const json = await readJson(response)
    if (isExpired(response.status, json)) {
      if (!allowRetry) throw new Error('云端登录已过期，重新登录失败')
      await this.ensureToken(true)
      return this.post(path, body, false)
    }
    if (response.status >= 400) throw new Error('云端接口请求失败')
    if (!json || json.code !== 20000) throw new Error(text(json?.message) || '云端接口返回失败')
    return json.data
  }

  private async ensureToken(force: boolean): Promise<string> {
    if (!force) {
      const existing = this.readSetting('crm_access_token')
      if (existing) return existing
    } else {
      this.writeSetting('crm_access_token', '')
      this.store.persist()
    }
    if (!this.loginFlight) {
      this.loginFlight = this.login().finally(() => {
        this.loginFlight = null
      })
    }
    await this.loginFlight
    const token = this.readSetting('crm_access_token')
    if (!token) throw new Error('云端登录失败')
    return token
  }

  private async login(): Promise<void> {
    const settings = this.settings()
    if (!cloudConfigured(settings)) throw new Error('未配置云端账号')
    const response = await this.fetchImpl(apiUrl(settings.crmBaseUrl, '/login/do_login'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: settings.crmUsername.trim(), password: settings.crmPassword }),
      signal: AbortSignal.timeout(settings.crmTimeoutMs),
    })
    const json = await readJson(response)
    const token = text(asRecord(json?.data)?.token)
    if (!response.ok || json?.code !== 20000 || !token) {
      throw new Error(text(json?.message) || '云端登录失败')
    }
    this.writeSetting('crm_access_token', token)
    this.store.persist()
    try {
      const info = await this.fetchImpl(apiUrl(settings.crmBaseUrl, '/login/admin_info'), {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(settings.crmTimeoutMs),
      })
      const infoJson = await readJson(info)
      const userId = asRecord(infoJson?.data)?.id
      if (info.ok && infoJson?.code === 20000 && userId != null) {
        this.writeSetting('crm_user_id', text(userId))
      }
    } catch {
      // 登录已成功。用户 id 缺失时客户列表仍按当前账号读取。
    }
    this.store.persist()
  }

  private readSetting(key: string): string {
    return text(queryOne(this.store.db, 'SELECT value FROM settings WHERE key = ?', [key])?.value)
  }

  private writeSetting(key: string, value: string): void {
    this.store.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    )
  }
}

async function readJson(response: Response): Promise<{ code?: number; message?: unknown; data?: unknown } | null> {
  try {
    return await response.json() as { code?: number; message?: unknown; data?: unknown }
  } catch {
    return null
  }
}

function isExpired(status: number, json: { message?: unknown } | null): boolean {
  if (status === 401 || status === 403) return true
  return text(json?.message) === 'Unauthenticated.'
}

export function emptyCustomers(configured: boolean): CustomerListResult {
  return { configured, source: configured ? 'error' : 'unconfigured', customers: [] }
}

export function customerMiss(configured: boolean): CustomerGetResult {
  return { configured, source: configured ? 'error' : 'unconfigured', customer: null }
}
