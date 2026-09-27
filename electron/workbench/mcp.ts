import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Workbench } from './service'
import { shanghaiClock } from './time'
import { SCENES } from './types'

type JsonRpc = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const PROTOCOL = '2025-03-26'

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string') return false
  const matched = /^Bearer\s+(.+)$/.exec(header)
  if (!matched) return false
  return safeEqual(matched[1].trim(), token)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('请求过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  }
}

const tools = [
  {
    name: 'get_daily_record',
    description: '读取某一天的工作记录。不传 date 时用 Asia/Shanghai 的今天。',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } } },
  },
  {
    name: 'save_daily_record',
    description: '按日期覆盖保存工作记录。空记录会拒绝。不会自动标记已查看。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        customerIds: { type: 'array', items: { type: 'string' } },
        customerNames: { type: 'string' },
        progress: { type: 'string' },
        pending: { type: 'string' },
        tomorrow: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['date'],
    },
  },
  {
    name: 'list_daily_records',
    description: '按日期范围列出工作记录，含首尾两天。',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'list_scripts',
    description: '列出回复话术。默认只返回启用中的话术。',
    inputSchema: { type: 'object', properties: { scene: { type: 'string' }, includeDisabled: { type: 'boolean' } } },
  },
  {
    name: 'get_script',
    description: '按 id 读取一条回复话术。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'save_script',
    description: '新增或更新回复话术。不传 id 则新建。场景必须是固定列表之一。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        scene: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        tags: { type: 'string' },
      },
      required: ['scene', 'title', 'body'],
    },
  },
  {
    name: 'disable_script',
    description: '停用一条回复话术。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_reply_habits',
    description: '列出用户明确保存的回复习惯。',
    inputSchema: { type: 'object', properties: { scene: { type: 'string' } } },
  },
  {
    name: 'save_reply_habit',
    description: '保存一条回复习惯。只有用户确认要记下来时才调用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        scene: { type: 'string' },
        structure: { type: 'string' },
        example: { type: 'string' },
      },
      required: ['scene', 'structure', 'example'],
    },
  },
  {
    name: 'delete_reply_habit',
    description: '删除一条回复习惯。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'search_knowledge',
    description: '按场景、客户名和关键词检索启用中的话术与回复习惯。起草前先调用。',
    inputSchema: {
      type: 'object',
      properties: {
        scene: { type: 'string', description: SCENES.join('、') },
        customer: { type: 'string' },
        query: { type: 'string' },
      },
    },
  },
  {
    name: 'list_customers',
    description: '读取云端私海客户。未配置账号时返回空列表，不会编造客户。断网时若有缓存会标明 source=cache。不读取邮箱，不连接 WhatsApp，不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'get_customer',
    description: '按云端客户 id 读取客户。不读取邮箱，不连接 WhatsApp，不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_projects',
    description: '读取当前账号的售前项目。只读。不读取邮箱，不连接 WhatsApp，不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_open_leads',
    description: '读取待处理线索，来源只作为文字标签。不打开邮件或 WhatsApp，不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_metal_prices',
    description: '读取云端金属参考价。只读。不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_project_inquiry',
    description: '读取某个售前项目的初始询盘摘要。只读。不读取邮箱会话，不连接 WhatsApp，不返回登录密码或令牌。',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
  },
  {
    name: 'draft_crm_note',
    description: '根据本地工作记录和云端客户详情生成可粘贴文本。不写入公司 CRM，不发邮件。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        customerId: { type: 'string' },
      },
    },
  },
]

async function callTool(wb: Workbench, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'get_daily_record': {
      const date = typeof args.date === 'string' && args.date ? args.date : shanghaiClock(new Date()).date
      return toolResult(JSON.stringify(wb.getRecord(date)))
    }
    case 'save_daily_record':
      return toolResult(JSON.stringify(wb.saveRecord({
        date: String(args.date ?? ''),
        customerIds: Array.isArray(args.customerIds) ? args.customerIds.map(String) : [],
        customerNames: String(args.customerNames ?? ''),
        progress: String(args.progress ?? ''),
        pending: String(args.pending ?? ''),
        tomorrow: String(args.tomorrow ?? ''),
        notes: String(args.notes ?? ''),
      })))
    case 'list_daily_records':
      return toolResult(JSON.stringify(wb.listRecords(String(args.from ?? ''), String(args.to ?? ''))))
    case 'list_scripts': {
      const scripts = wb.listScripts(args.includeDisabled === true)
      const scene = typeof args.scene === 'string' ? args.scene : ''
      return toolResult(JSON.stringify(scene ? scripts.filter(item => item.scene === scene) : scripts))
    }
    case 'get_script':
      return toolResult(JSON.stringify(wb.getScript(String(args.id ?? ''))))
    case 'save_script':
      return toolResult(JSON.stringify(wb.saveScript({
        id: typeof args.id === 'string' ? args.id : undefined,
        scene: String(args.scene ?? ''),
        title: String(args.title ?? ''),
        body: String(args.body ?? ''),
        tags: typeof args.tags === 'string' ? args.tags : '',
      })))
    case 'disable_script':
      wb.disableScript(String(args.id ?? ''))
      return toolResult('已停用')
    case 'list_reply_habits':
      return toolResult(JSON.stringify(wb.listHabits(typeof args.scene === 'string' ? args.scene : undefined)))
    case 'save_reply_habit':
      return toolResult(JSON.stringify(wb.saveHabit({
        id: typeof args.id === 'string' ? args.id : undefined,
        scene: String(args.scene ?? ''),
        structure: String(args.structure ?? ''),
        example: String(args.example ?? ''),
      })))
    case 'delete_reply_habit':
      wb.deleteHabit(String(args.id ?? ''))
      return toolResult('已删除')
    case 'search_knowledge':
      return toolResult(JSON.stringify(wb.searchKnowledge({
        scene: typeof args.scene === 'string' ? args.scene : undefined,
        customer: typeof args.customer === 'string' ? args.customer : undefined,
        query: typeof args.query === 'string' ? args.query : undefined,
      })))
    case 'list_customers':
      return toolResult(JSON.stringify(await wb.listCustomers(typeof args.query === 'string' ? args.query : '')))
    case 'get_customer':
      return toolResult(JSON.stringify(await wb.getCustomer(String(args.id ?? ''))))
    case 'list_projects':
      return toolResult(JSON.stringify(await wb.listProjects()))
    case 'list_open_leads':
      return toolResult(JSON.stringify(await wb.listLeads()))
    case 'list_metal_prices':
      return toolResult(JSON.stringify(await wb.listMetals()))
    case 'get_project_inquiry':
      return toolResult(JSON.stringify(await wb.getProjectInquiry(String(args.projectId ?? ''))))
    case 'draft_crm_note':
      return toolResult(JSON.stringify(await wb.draftCrmNote({
        date: typeof args.date === 'string' ? args.date : undefined,
        customerId: typeof args.customerId === 'string' ? args.customerId : undefined,
      })))
    default:
      throw new Error(`未知工具 ${name}`)
  }
}

async function handleRpc(wb: Workbench, message: JsonRpc) {
  const id = message.id ?? null
  if (message.jsonrpc !== '2.0' || !message.method) {
    return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32600, message: '无效请求' } } }
  }
  try {
    if (message.method === 'initialize') {
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL,
            capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
            serverInfo: { name: 'zbwork', version: '1.0.0' },
          },
        },
      }
    }
    if (message.method === 'ping') {
      return { status: 200, body: { jsonrpc: '2.0', id, result: {} } }
    }
    if (message.method === 'tools/list') {
      return { status: 200, body: { jsonrpc: '2.0', id, result: { tools } } }
    }
    if (message.method === 'tools/call') {
      const params = message.params ?? {}
      const name = String(params.name ?? '')
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments as Record<string, unknown> : {}
      try {
        const result = await callTool(wb, name, args)
        return { status: 200, body: { jsonrpc: '2.0', id, result } }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : '工具执行失败'
        return { status: 200, body: { jsonrpc: '2.0', id, result: toolResult(messageText, true) } }
      }
    }
    if (message.method === 'resources/list') {
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              { uri: 'workbench://today', name: 'today', mimeType: 'application/json' },
              { uri: 'workbench://knowledge', name: 'knowledge', mimeType: 'application/json' },
            ],
          },
        },
      }
    }
    if (message.method === 'resources/read') {
      const uri = String(message.params?.uri ?? '')
      if (uri === 'workbench://today') {
        return { status: 200, body: { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await wb.todaySnapshot()) }] } } }
      }
      if (uri === 'workbench://knowledge') {
        return { status: 200, body: { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(wb.knowledgeSummary()) }] } } }
      }
      if (uri.startsWith('workbench://customer/')) {
        const customerId = decodeURIComponent(uri.slice('workbench://customer/'.length))
        const customer = await wb.getCustomer(customerId)
        return { status: 200, body: { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(customer) }] } } }
      }
      return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32002, message: '没有这个资源' } } }
    }
    return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32601, message: '方法不存在' } } }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : '内部错误'
    return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32603, message: messageText } } }
  }
}

export async function startMcp(wb: Workbench, options: { port: number; token: string; host?: string }): Promise<{ port: number; close: () => Promise<void> }> {
  const host = options.host ?? '127.0.0.1'
  const server = createServer(async (req, res) => {
    try {
      if (!authorized(req, options.token)) {
        sendJson(res, 401, { error: 'unauthorized' })
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return
      }
      if (req.method !== 'POST' || !req.url?.startsWith('/mcp')) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      const raw = await readBody(req)
      const message = JSON.parse(raw) as JsonRpc
      if (message.id === undefined) {
        res.writeHead(202)
        res.end()
        return
      }
      const outcome = await handleRpc(wb, message)
      sendJson(res, outcome.status, outcome.body)
    } catch {
      if (!res.headersSent) sendJson(res, 400, { error: 'bad_request' })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, host, () => resolve())
  })

  const address = server.address()
  const port = address && typeof address === 'object' ? address.port : options.port
  return {
    port,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
  }
}
