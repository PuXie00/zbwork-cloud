import type { Customer, CustomerGetResult, CustomerListResult, Settings } from './types'
import { queryAll, queryOne, type WorkbenchDb } from './db'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function configured(settings: Settings): boolean {
  return settings.crmBaseUrl.trim().length > 0
}

function authHeaders(settings: Settings): Record<string, string> {
  if (!settings.crmToken) return {}
  if (settings.crmAuthType === 'header') {
    return { [settings.crmHeaderName || 'Authorization']: settings.crmToken }
  }
  return { Authorization: `Bearer ${settings.crmToken}` }
}

function joinUrl(base: string, resourcePath: string): string {
  const root = base.trim().replace(/\/$/, '')
  const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`
  return `${root}${path}`
}

export function readCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = record.id ?? record.customerId ?? record.Id
  if (id == null || String(id).trim() === '') return null
  const name = record.name ?? record.customerName ?? record.Name ?? ''
  const company = record.company ?? record.companyName ?? record.Company ?? ''
  const email = record.email ?? record.mail ?? record.Email ?? ''
  return {
    id: String(id),
    name: String(name),
    company: String(company),
    email: String(email),
  }
}

export function readCustomerList(payload: unknown): Customer[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { customers?: unknown }).customers)
      ? (payload as { customers: unknown[] }).customers
      : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : null
  if (!list) throw new Error('云端客户列表格式无法识别')
  return list.map(readCustomer).filter((item): item is Customer => item !== null)
}

export function readCustomerOne(payload: unknown): Customer | null {
  if (payload && typeof payload === 'object' && 'customer' in payload) {
    return readCustomer((payload as { customer: unknown }).customer)
  }
  if (payload && typeof payload === 'object' && 'data' in payload && !Array.isArray((payload as { data: unknown }).data)) {
    return readCustomer((payload as { data: unknown }).data)
  }
  return readCustomer(payload)
}

function cacheCustomers(store: WorkbenchDb, customers: Customer[], cachedAt: string): void {
  store.db.run('DELETE FROM customer_cache')
  for (const customer of customers) {
    store.db.run(
      'INSERT INTO customer_cache (id, name, company, email, cached_at) VALUES (?, ?, ?, ?, ?)',
      [customer.id, customer.name, customer.company, customer.email, cachedAt],
    )
  }
  store.persist()
}

function cachedCustomers(store: WorkbenchDb): Customer[] {
  return queryAll(store.db, 'SELECT id, name, company, email FROM customer_cache ORDER BY name, id').map(row => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    company: String(row.company ?? ''),
    email: String(row.email ?? ''),
  }))
}

function cachedCustomer(store: WorkbenchDb, id: string): Customer | null {
  const row = queryOne(store.db, 'SELECT id, name, company, email FROM customer_cache WHERE id = ?', [id])
  if (!row) return null
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    company: String(row.company ?? ''),
    email: String(row.email ?? ''),
  }
}

async function requestJson(url: string, settings: Settings, fetchImpl: FetchLike): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeaders(settings),
    },
    signal: AbortSignal.timeout(settings.crmTimeoutMs),
  })
  if (!response.ok) throw new Error(`云端 CRM 返回 ${response.status}`)
  return response.json()
}

export async function listCustomers(
  store: WorkbenchDb,
  settings: Settings,
  fetchImpl: FetchLike,
  query = '',
): Promise<CustomerListResult> {
  if (!configured(settings)) {
    return { configured: false, source: 'unconfigured', customers: [] }
  }
  const url = new URL(joinUrl(settings.crmBaseUrl, settings.crmCustomersPath))
  if (query.trim()) url.searchParams.set('q', query.trim())
  try {
    const payload = await requestJson(url.toString(), settings, fetchImpl)
    const customers = readCustomerList(payload)
    if (!query.trim()) cacheCustomers(store, customers, new Date().toISOString())
    return { configured: true, source: 'live', customers }
  } catch (error) {
    const customers = cachedCustomers(store)
    const message = error instanceof Error ? error.message : '云端 CRM 请求失败'
    if (customers.length > 0) return { configured: true, source: 'cache', customers, message }
    return { configured: true, source: 'error', customers: [], message }
  }
}

export async function getCustomer(
  store: WorkbenchDb,
  settings: Settings,
  fetchImpl: FetchLike,
  id: string,
): Promise<CustomerGetResult> {
  if (!configured(settings)) {
    return { configured: false, source: 'unconfigured', customer: null }
  }
  const path = settings.crmCustomerPath.replaceAll('{id}', encodeURIComponent(id))
  try {
    const payload = await requestJson(joinUrl(settings.crmBaseUrl, path), settings, fetchImpl)
    const customer = readCustomerOne(payload)
    if (!customer) return { configured: true, source: 'live', customer: null, message: '云端没有这个客户' }
    const existing = cachedCustomers(store).filter(item => item.id !== customer.id)
    cacheCustomers(store, [...existing, customer], new Date().toISOString())
    return { configured: true, source: 'live', customer }
  } catch (error) {
    const customer = cachedCustomer(store, id)
    const message = error instanceof Error ? error.message : '云端 CRM 请求失败'
    if (customer) return { configured: true, source: 'cache', customer, message }
    return { configured: true, source: 'error', customer: null, message }
  }
}
