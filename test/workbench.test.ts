import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Workbench } from '../electron/workbench/service'

const files: string[] = []

async function openWorkbench(fetchImpl?: typeof fetch) {
  const filename = path.join(os.tmpdir(), `zbwork-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
  files.push(filename)
  return Workbench.open(filename, fetchImpl)
}

afterEach(() => {
  for (const filename of files.splice(0)) {
    fs.rmSync(filename, { force: true })
    fs.rmSync(`${filename}.tmp`, { force: true })
  }
})

describe('每日记录', () => {
  it('保存后能读到，空记录拒绝，已查看不会把记录从列表拿掉', async () => {
    const wb = await openWorkbench()
    expect(() => wb.saveRecord({ date: '2026-09-27' })).toThrow('记录是空的')
    const saved = wb.saveRecord({
      date: '2026-09-27',
      customerNames: 'Acme',
      progress: '报价 925 银戒',
      pending: '等客户确认镀金',
      tomorrow: '发 PI',
      notes: '要证书',
    })
    expect(saved.customerNames).toBe('Acme')
    expect(wb.getRecord('2026-09-27')?.progress).toBe('报价 925 银戒')
    wb.markReviewed('2026-09-27')
    expect(wb.listRecords('2026-09-01', '2026-09-30')).toHaveLength(1)
    expect(wb.getRecord('2026-09-27')?.reviewedAt).toBeTruthy()
    wb.close()
  })

  it('保存之后 17:00 不再进入待提醒', async () => {
    const wb = await openWorkbench()
    wb.saveRecord({ date: '2026-09-27', notes: '写过了' })
    const due = wb.pendingReminders(new Date('2026-09-27T09:00:00.000Z'))
    expect(due.map(item => item.slot)).not.toContain('write_second')
    expect(due.map(item => item.slot)).not.toContain('write_first')
    wb.close()
  })

  it('未保存时记下已触发的提醒，避免同一刻重复响', async () => {
    const wb = await openWorkbench()
    const now = new Date('2026-09-27T08:00:00.000Z')
    const first = wb.pendingReminders(now)
    expect(first.map(item => item.slot)).toEqual(['write_first'])
    wb.acknowledgeReminder(first[0].fireKey)
    expect(wb.pendingReminders(now)).toEqual([])
    const later = wb.pendingReminders(new Date('2026-09-27T09:00:00.000Z'))
    expect(later.map(item => item.slot)).toEqual(['write_second'])
    wb.close()
  })
})

describe('知识库', () => {
  it('话术可停用，习惯只在保存后存在，检索按场景返回', async () => {
    const wb = await openWorkbench()
    const script = wb.saveScript({
      scene: '报价',
      title: '银饰报价',
      body: '925 sterling silver, MOQ 50.',
      tags: '925 MOQ',
    })
    wb.saveScript({ scene: '跟进', title: '跟进', body: 'Just checking in.', tags: '' })
    wb.disableScript(script.id)
    expect(wb.listScripts(false).map(item => item.title)).toEqual(['跟进'])
    expect(wb.searchKnowledge({ scene: '报价' }).scripts).toEqual([])
    expect(wb.listHabits()).toEqual([])
    wb.saveHabit({ scene: '报价', structure: '先确认数量，再给阶梯价', example: 'For 100pcs, the price is ...' })
    const hit = wb.searchKnowledge({ scene: '报价', query: '阶梯价' })
    expect(hit.habits).toHaveLength(1)
    expect(hit.scripts).toEqual([])
    wb.close()
  })
})

describe('云端 CRM', () => {
  it('未配置用户名或密码时不编造客户，也不发请求', async () => {
    let called = false
    const wb = await openWorkbench(async () => {
      called = true
      throw new Error('不应该请求')
    })
    wb.updateSettings({ crmBaseUrl: 'https://admin.example.test' })
    const list = await wb.listCustomers()
    expect(list).toEqual({ configured: false, source: 'unconfigured', customers: [] })
    expect(await wb.listProjects()).toEqual([])
    expect(await wb.getProjectInquiry('633')).toBeNull()
    expect(called).toBe(false)
    const note = await wb.draftCrmNote({ date: '2026-09-26' })
    expect(note.text).toContain('当日记录：无')
    wb.close()
  })

  it('登录一次后复用会话，过期才重登，断网用缓存，结果不含密码', async () => {
    const password = 'secret-pass'
    const cloud = createCloud(password)
    const filename = path.join(os.tmpdir(), `zbwork-cloud-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
    files.push(filename)
    const live = await Workbench.open(filename, cloud.fetchImpl)
    live.updateSettings({
      crmBaseUrl: 'https://admin.example.test',
      crmUsername: 'seller',
      crmPassword: password,
    })

    const list = await live.listCustomers()
    expect(list.source).toBe('live')
    expect(list.customers.map(item => item.name)).toEqual(['Mia', 'Owen'])
    expect(list.customers[0].country).toBe('US')
    expect(cloud.logins).toBe(1)
    expect(cloud.ownerIds).toEqual([42])
    expect(JSON.stringify(list)).not.toContain(password)
    expect(JSON.stringify(list)).not.toContain('session-')

    const again = await live.listCustomers()
    expect(again.customers).toHaveLength(2)
    expect(cloud.customerLists).toBe(1)

    const filtered = await live.listCustomers('Mia')
    expect(filtered.customers.map(item => item.id)).toEqual(['7'])
    expect(cloud.logins).toBe(1)

    const snapshot = await live.todaySnapshot(new Date('2026-09-27T02:00:00.000Z'))
    expect(snapshot.projects[0]?.stage).toContain('未回复')
    expect(snapshot.leads[0]?.source).toBe('whatsapp')
    expect(snapshot.metals.map(item => item.code)).toEqual(['Ag', 'Au'])
    expect(cloud.logins).toBe(1)
    expect(JSON.stringify(snapshot)).not.toContain(password)

    cloud.armExpiry()
    const refreshed = await live.listCustomers('Owen')
    expect(refreshed.customers.map(item => item.id)).toEqual(['8'])
    expect(cloud.logins).toBe(2)

    live.updateSettings({ crmUsername: 'seller', crmPassword: password, remindReview: '10:30' })
    await live.listCustomers('US')
    expect(cloud.logins).toBe(2)

    await expect(live.getProjectInquiry('')).rejects.toThrow('缺少 project_id')
    expect(cloud.logins).toBe(2)
    const inquiry = await live.getProjectInquiry('633')
    expect(inquiry?.summary).toBe('银戒询价')
    expect(inquiry?.message).toContain('silver ring')
    expect(JSON.stringify(inquiry)).not.toContain(password)

    live.updateSettings({ crmPassword: 'next-secret' })
    cloud.password = 'next-secret'
    await live.listCustomers('Mia')
    expect(cloud.logins).toBe(3)
    live.close()

    const reused = await Workbench.open(filename, cloud.fetchImpl)
    const reusedList = await reused.listCustomers('Lumen')
    expect(reusedList.source).toBe('live')
    expect(reusedList.customers[0]?.name).toBe('Mia')
    expect(cloud.logins).toBe(3)
    reused.close()

    cloud.dropNetwork()
    const offline = await Workbench.open(filename, cloud.fetchImpl)
    const offlineList = await offline.listCustomers()
    expect(offlineList.source).toBe('cache')
    expect(offlineList.customers.map(item => item.name)).toEqual(['Mia', 'Owen'])
    expect(offlineList.customers[0]?.country).toBe('US')
    const note = await offline.draftCrmNote({ date: '2026-09-26', customerId: '7' })
    expect(note.text).toContain('Mia')
    expect(note.text).toContain('id:7')
    expect(JSON.stringify(note)).not.toContain('next-secret')
    expect(JSON.stringify(note)).not.toContain(password)
    expect(cloud.logins).toBe(3)
    offline.close()
  })
})

function createCloud(initialPassword: string) {
  const state = {
    password: initialPassword,
    logins: 0,
    customerLists: 0,
    ownerIds: [] as unknown[],
    activeToken: '',
    rejectOnce: false,
    offline: false,
  }
  const fetchImpl: typeof fetch = async (url, init) => {
    if (state.offline) throw new Error('网络中断')
    const href = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    const headers = new Headers(init?.headers)
    const auth = headers.get('authorization') ?? ''
    if (href.endsWith('/login/do_login')) {
      state.logins += 1
      if (body.password !== state.password) {
        return cloudJson({ code: 20001, message: '账号或密码错误' })
      }
      state.activeToken = `session-${state.logins}`
      return cloudJson({ code: 20000, data: { token: state.activeToken }, message: 'success' })
    }
    if (href.endsWith('/login/admin_info')) {
      if (auth !== `Bearer ${state.activeToken}`) return cloudJson({ message: 'Unauthenticated.' }, 401)
      return cloudJson({ code: 20000, data: { id: 42, name: 'Josie' } })
    }
    if (state.rejectOnce) {
      state.rejectOnce = false
      return cloudJson({ message: 'Unauthenticated.' }, 401)
    }
    if (auth !== `Bearer ${state.activeToken}`) return cloudJson({ message: 'Unauthenticated.' }, 401)
    if (href.endsWith('/xiaoman/customer/list')) {
      state.customerLists += 1
      state.ownerIds.push(body.owner_id)
      return cloudJson({
        code: 20000,
        data: {
          data: {
            data: [
              { id: 7, name: 'Mia', email: 'mia@example.test', company: 'Lumen', country: 'US', source: 'site' },
              { id: 8, name: 'Owen', email: 'owen@example.test', company: 'North', country: 'DE', source: 'fair' },
            ],
          },
        },
      })
    }
    if (href.endsWith('/xiaoman/customer/detail')) {
      return cloudJson({ code: 20000, data: { id: body.id, name: 'Mia', email: 'mia@example.test', company: 'Lumen', country: 'US', source: 'site' } })
    }
    if (href.endsWith('/pre_sales_v2/project/funnel-snapshot')) {
      return cloudJson({
        code: 20000,
        data: {
          list: [{
            id: 633,
            name: 'ZYH_MT_20260927',
            customer_name: 'Mia',
            customer_email: 'mia@example.test',
            updated_at: '2026-09-27',
            funnel_stage: { stage_label: 'OEM初始询盘-未回复' },
          }],
        },
      })
    }
    if (href.endsWith('/lky_workbench/leads')) {
      return cloudJson({
        code: 20000,
        data: {
          list: [{ id: 3, name: 'Leah', country: 'UK', source: 'whatsapp', need: 'ring', product_type: 'ring' }],
          total: 1,
        },
      })
    }
    if (href.endsWith('/lky_oem_pricing_ref/metal/list')) {
      return cloudJson({
        code: 20000,
        data: {
          rows: [
            { metal_code: 'Ag', purity: '925', price_rmb_per_g: '8.2', quoted_at: '2026-09-27' },
            { metal_code: 'Au', purity: '750', price_rmb_per_g: '580', quoted_at: '2026-09-27' },
          ],
        },
      })
    }
    if (href.endsWith('/lky_oem_inquiry/from-project')) {
      if (!body.project_id) return cloudJson({ code: 20001, message: '缺少 project_id' })
      return cloudJson({ code: 20000, data: { inquiry: { id: 15 } } })
    }
    if (href.endsWith('/lky_oem_inquiry/detail')) {
      return cloudJson({
        code: 20000,
        data: {
          inquiry_no: 'IN-15',
          customer_name: 'Mia',
          customer_product_type: 'ring',
          customer_metal_material: '925',
          customer_quantity: '50',
          customer_language: 'en',
          customer_message: 'Need a silver ring quote.',
          ai_summary: '银戒询价',
        },
      })
    }
    return cloudJson({ code: 20001, message: '未知接口' }, 404)
  }
  return {
    fetchImpl,
    get logins() { return state.logins },
    get customerLists() { return state.customerLists },
    get ownerIds() { return state.ownerIds },
    set password(value: string) { state.password = value },
    armExpiry() { state.rejectOnce = true },
    dropNetwork() { state.offline = true },
  }
}

function cloudJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}
