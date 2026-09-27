import { useEffect, useState } from 'react'
import { buildCursorMcpConfig } from '../../electron/workbench/draft'
import type { Settings } from '../../electron/workbench/types'
import { getWorkbench } from './api'
import { Button, ErrorText, Field, TextInput } from './ui'

export function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    const api = getWorkbench()
    void api.getSettings().then(setForm).catch(err => setError(err instanceof Error ? err.message : '加载失败'))
    void api.getMcpStatus().then(mcp => setStatus(mcp.running ? `MCP 正在 127.0.0.1:${mcp.port}` : mcp.error || 'MCP 未启动'))
  }, [])

  const handleSave = async () => {
    if (!form) return
    setError('')
    try {
      const saved = await getWorkbench().saveSettings(form)
      setForm(saved)
      const mcp = await getWorkbench().getMcpStatus()
      setStatus(mcp.running ? `MCP 正在 127.0.0.1:${mcp.port}` : mcp.error || 'MCP 未启动')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const handleCopy = async () => {
    if (!form) return
    await getWorkbench().copyText(buildCursorMcpConfig(form.mcpPort, form.mcpToken))
    setCopied(true)
  }

  if (!form) return <p className="text-sm text-stone-500">正在读取设置…</p>

  return (
    <form className="max-w-2xl space-y-6" onSubmit={event => { event.preventDefault(); void handleSave() }}>
      <h1 className="text-2xl font-semibold">设置</h1>
      <p className="text-sm text-stone-600">{status}</p>
      <section className="grid gap-3">
        <h2 className="font-medium">提醒时刻</h2>
        <Field label="第一次写入提醒"><TextInput value={form.remindWriteFirst} onChange={event => setForm({ ...form, remindWriteFirst: event.target.value })} /></Field>
        <Field label="第二次写入提醒"><TextInput value={form.remindWriteSecond} onChange={event => setForm({ ...form, remindWriteSecond: event.target.value })} /></Field>
        <Field label="次日回看"><TextInput value={form.remindReview} onChange={event => setForm({ ...form, remindReview: event.target.value })} /></Field>
      </section>
      <section className="grid gap-3">
        <h2 className="font-medium">MCP</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.mcpEnabled} onChange={event => setForm({ ...form, mcpEnabled: event.target.checked })} />
          工作台打开时在本机提供 MCP
        </label>
        <Field label="端口"><TextInput type="number" value={form.mcpPort} onChange={event => setForm({ ...form, mcpPort: Number(event.target.value) })} /></Field>
        <Field label="Token">
          <TextInput type={showToken ? 'text' : 'password'} value={form.mcpToken} onChange={event => setForm({ ...form, mcpToken: event.target.value })} aria-label="MCP token" />
        </Field>
        <button type="button" className="w-fit text-sm text-stone-600 underline" onClick={() => setShowToken(value => !value)}>{showToken ? '隐藏 token' : '显示 token'}</button>
        <Button type="button" tone="ghost" onClick={() => void handleCopy()}>{copied ? '已复制 Cursor 配置' : '复制 Cursor MCP 配置'}</Button>
      </section>
      <section className="grid gap-3">
        <h2 className="font-medium">云端 CRM</h2>
        <Field label="Base URL"><TextInput value={form.crmBaseUrl} onChange={event => setForm({ ...form, crmBaseUrl: event.target.value })} placeholder="https://crm.example.com/api" /></Field>
        <Field label="鉴权">
          <select className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" value={form.crmAuthType} onChange={event => setForm({ ...form, crmAuthType: event.target.value as Settings['crmAuthType'] })} aria-label="鉴权方式">
            <option value="bearer">Bearer</option>
            <option value="header">自定义头</option>
          </select>
        </Field>
        <Field label="头名称"><TextInput value={form.crmHeaderName} onChange={event => setForm({ ...form, crmHeaderName: event.target.value })} /></Field>
        <Field label="密钥"><TextInput type="password" value={form.crmToken} onChange={event => setForm({ ...form, crmToken: event.target.value })} aria-label="CRM 密钥" /></Field>
        <Field label="客户列表路径"><TextInput value={form.crmCustomersPath} onChange={event => setForm({ ...form, crmCustomersPath: event.target.value })} /></Field>
        <Field label="客户详情路径"><TextInput value={form.crmCustomerPath} onChange={event => setForm({ ...form, crmCustomerPath: event.target.value })} /></Field>
        <Field label="超时（毫秒）"><TextInput type="number" value={form.crmTimeoutMs} onChange={event => setForm({ ...form, crmTimeoutMs: Number(event.target.value) })} /></Field>
      </section>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.openAtLogin} onChange={event => setForm({ ...form, openAtLogin: event.target.checked })} />
        开机启动
      </label>
      <Button type="submit">保存设置</Button>
      <ErrorText>{error}</ErrorText>
    </form>
  )
}
