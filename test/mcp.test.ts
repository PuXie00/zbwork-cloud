import { afterEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { startMcp } from '../electron/workbench/mcp'
import { Workbench } from '../electron/workbench/service'

const files: string[] = []

afterEach(() => {
  for (const filename of files.splice(0)) fs.rmSync(filename, { force: true })
})

async function rpc(port: number, token: string, body: unknown, auth = true) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) as Record<string, unknown> : null }
}

describe('MCP', () => {
  it('只接受带 token 的本机请求，并能读写同一条记录', async () => {
    const filename = path.join(os.tmpdir(), `zbwork-mcp-${Date.now()}.sqlite`)
    files.push(filename)
    const wb = await Workbench.open(filename)
    const token = wb.getSettings().mcpToken
    const server = await startMcp(wb, { port: 0, token })
    try {
      const denied = await rpc(server.port, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, false)
      expect(denied.status).toBe(401)

      const listed = await rpc(server.port, token, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const tools = (listed.json?.result as { tools: { name: string }[] }).tools.map(tool => tool.name)
      expect(tools).toContain('draft_crm_note')
      expect(tools).toContain('search_knowledge')

      const saved = await rpc(server.port, token, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'save_daily_record', arguments: { date: '2026-09-27', notes: '客户要看莫桑石' } },
      })
      expect((saved.json?.result as { isError?: boolean }).isError).toBeFalsy()
      expect(wb.getRecord('2026-09-27')?.notes).toBe('客户要看莫桑石')

      const note = await rpc(server.port, token, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'draft_crm_note', arguments: { date: '2026-09-27' } },
      })
      const text = (note.json?.result as { content: { text: string }[] }).content[0].text
      expect(text).toContain('客户要看莫桑石')
      expect(text).not.toContain(token)

      const empty = await rpc(server.port, token, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'save_daily_record', arguments: { date: '2026-09-28' } },
      })
      expect((empty.json?.result as { isError: boolean }).isError).toBe(true)
    } finally {
      await server.close()
      wb.close()
    }
  })
})
