import { useEffect, useState } from 'react'
import type { Customer, CustomerGetResult, CustomerListResult } from '../../electron/workbench/types'
import { getWorkbench } from './api'
import { Button, ErrorText, TextInput } from './ui'

export function CustomersPage() {
  const [query, setQuery] = useState('')
  const [list, setList] = useState<CustomerListResult | null>(null)
  const [detail, setDetail] = useState<CustomerGetResult | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = async (keyword: string) => {
    setList(await getWorkbench().listCustomers(keyword))
  }

  useEffect(() => {
    void load('').catch(err => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const handleOpen = async (customer: Customer) => {
    setDetail(await getWorkbench().getCustomer(customer.id))
    setNote('')
  }

  const handleDraft = async () => {
    if (!detail?.customer) return
    const result = await getWorkbench().draftCrmNote({ customerId: detail.customer.id })
    setNote(result.text)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">客户</h1>
      <ErrorText>{error}</ErrorText>
      {list && !list.configured && <p className="text-sm text-stone-600">未配置云端账号。到设置里填写用户名和密码后再查看客户，这里不会显示假客户。</p>}
      {list?.configured && (
        <>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void load(query) }}>
            <TextInput value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索客户" placeholder="搜索客户" />
            <Button type="submit" tone="ghost">搜索</Button>
          </form>
          <p className="text-xs text-stone-500">{list.source === 'cache' ? `缓存。${list.message ?? ''}` : list.source === 'error' ? list.message : '云端'}</p>
          {list.customers.length === 0 && <p className="text-sm text-stone-500">没有客户。</p>}
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
              {list.customers.map(customer => (
                <li key={customer.id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => void handleOpen(customer)}>
                    <span className="block font-medium">{customer.name || customer.id}</span>
                    <span className="text-stone-500">{[customer.company || '无公司', customer.country].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
            {detail?.customer && (
              <article className="space-y-3 rounded-md border border-stone-200 bg-white p-4">
                <h2 className="text-lg font-semibold">{detail.customer.name || detail.customer.id}</h2>
                <p className="text-sm text-stone-600">{detail.customer.company || '无公司'} · {detail.customer.country || '无国家'} · {detail.customer.email || '无邮箱'}</p>
                <p className="text-xs text-stone-500">id: {detail.customer.id} · {detail.source === 'cache' ? '缓存' : '云端'}</p>
                <Button type="button" tone="ghost" onClick={() => void handleDraft()}>生成 CRM 粘贴稿</Button>
                {note && <pre className="whitespace-pre-wrap text-sm">{note}</pre>}
              </article>
            )}
          </div>
        </>
      )}
    </div>
  )
}
