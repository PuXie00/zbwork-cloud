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
  it('未配置时不编造客户，也不发请求', async () => {
    let called = false
    const wb = await openWorkbench(async () => {
      called = true
      throw new Error('不应该请求')
    })
    wb.updateSettings({ crmToken: 'crm-secret-token' })
    const list = await wb.listCustomers()
    expect(list).toEqual({ configured: false, source: 'unconfigured', customers: [] })
    expect(called).toBe(false)
    const note = await wb.draftCrmNote({ date: '2026-09-26' })
    expect(note.text).toContain('当日记录：无')
    expect(JSON.stringify(note)).not.toContain('crm-secret-token')
    wb.close()
  })

  it('配置后读取云端客户，断网时用缓存，粘贴稿不含密钥', async () => {
    const secret = 'crm-secret-token'
    const filename = path.join(os.tmpdir(), `zbwork-seed-${Date.now()}.sqlite`)
    files.push(filename)
    const live = await Workbench.open(filename, async (url, init) => {
      if ((init?.method ?? 'GET') !== 'GET') throw new Error('只允许读取')
      if (String(url).includes('/customers/c1')) {
        return new Response(JSON.stringify({ customer: { id: 'c1', customerName: 'Mia', companyName: 'Lumen', mail: 'mia@lumen.test' } }), { status: 200 })
      }
      return new Response(JSON.stringify([{ id: 'c1', name: 'Mia', company: 'Lumen', email: 'mia@lumen.test' }]), { status: 200 })
    })
    live.updateSettings({ crmBaseUrl: 'https://crm.example.test/api', crmToken: secret })
    const list = await live.listCustomers()
    expect(list.source).toBe('live')
    expect(list.customers[0].name).toBe('Mia')
    expect(JSON.stringify(list)).not.toContain(secret)
    live.close()

    const offline = await Workbench.open(filename, async () => {
      throw new Error('网络中断')
    })
    const offlineList = await offline.listCustomers()
    expect(offlineList.source).toBe('cache')
    expect(offlineList.customers[0].name).toBe('Mia')
    const note = await offline.draftCrmNote({ date: '2026-09-26', customerId: 'c1' })
    expect(note.text).toContain('Mia')
    expect(note.text).toContain('id:c1')
    expect(JSON.stringify(note)).not.toContain(secret)
    offline.close()
  })
})
