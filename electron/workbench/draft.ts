import type { Customer, DailyRecord } from './types'

export function formatCrmNote(input: {
  date: string
  record: DailyRecord | null
  customer: Customer | null
  customerMissingId?: string
}): string {
  const customerLine = input.customer
    ? `客户：${input.customer.name || '未命名'}｜${input.customer.company || '无公司'}｜${input.customer.email || '无邮箱'}｜id:${input.customer.id}`
    : input.customerMissingId
      ? `客户：未在云端找到（id:${input.customerMissingId}）`
      : '客户：未指定'
  const lines = [`日期：${input.date}`, customerLine]
  if (!input.record) {
    lines.push('当日记录：无')
    return lines.join('\n')
  }
  lines.push(
    `跟进：${input.record.customerNames || '无'}`,
    `进展：${input.record.progress || '无'}`,
    `未完成：${input.record.pending || '无'}`,
    `明天：${input.record.tomorrow || '无'}`,
    `备注：${input.record.notes || '无'}`,
  )
  return lines.join('\n')
}

export function buildCursorMcpConfig(port: number, token: string): string {
  return JSON.stringify({
    mcpServers: {
      zbwork: {
        url: `http://127.0.0.1:${port}/mcp`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  }, null, 2)
}
