import { useEffect, useState } from 'react'
import type { TodaySnapshot } from '../../electron/workbench/types'
import { getWorkbench } from './api'
import { Button, ErrorText } from './ui'

export function HomePage({ onWrite }: { onWrite: () => void }) {
  const [data, setData] = useState<TodaySnapshot | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const snapshot = await getWorkbench().getToday()
    setData(snapshot)
  }

  useEffect(() => {
    void load().catch(err => setError(err instanceof Error ? err.message : '加载失败'))
    const timer = window.setInterval(() => {
      void load().catch(() => undefined)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const handleReviewed = async () => {
    if (!data?.yesterday) return
    await getWorkbench().markReviewed(data.yesterday.date)
    await load()
  }

  const handleDraft = async () => {
    if (!data) return
    const result = await getWorkbench().draftCrmNote({ date: data.yesterdayDate })
    setNote(result.text)
    setCopied(false)
  }

  const handleCopy = async () => {
    await getWorkbench().copyText(note)
    setCopied(true)
  }

  if (!data) return <p className="text-sm text-stone-500">正在读取今天…</p>

  const showYesterday = data.reviewVisible

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-stone-500">北京时间 {data.date} {data.timeLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-900">今日工作台</h1>
      </header>
      <ErrorText>{error}</ErrorText>

      {showYesterday && data.yesterday && !data.yesterday.reviewedAt && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5" aria-label="昨日工作记录">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">昨日记录</h2>
              <p className="text-sm text-stone-600">{data.yesterday.date}</p>
            </div>
            <Button type="button" onClick={() => void handleReviewed()}>已查看</Button>
          </div>
          <RecordBody record={data.yesterday} />
        </section>
      )}

      {showYesterday && !data.yesterday && (
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold">昨日未写记录</h2>
        </section>
      )}

      {!showYesterday && (
        <p className="text-sm text-stone-500">昨日记录会在 {data.reviewAt} 后出现在这里。</p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">今天</h2>
          <Button type="button" onClick={onWrite}>{data.today ? '修改今日记录' : '写入今日记录'}</Button>
        </div>
        {data.today ? <RecordBody record={data.today} /> : <p className="text-sm text-stone-500">今天还没保存记录。16:00 和 17:00 会提醒。</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">待跟进</h2>
        <p className="text-sm text-stone-700">{data.today?.customerNames || '今日记录里还没有点名客户。'}</p>
        <CustomerSource snapshot={data} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">CRM 粘贴稿</h2>
          <Button type="button" tone="ghost" onClick={() => void handleDraft()}>按昨日记录生成</Button>
          {note && <Button type="button" tone="ghost" onClick={() => void handleCopy()}>{copied ? '已复制' : '复制'}</Button>}
        </div>
        {note && <pre className="whitespace-pre-wrap rounded-md bg-white p-4 text-sm text-stone-800">{note}</pre>}
      </section>
    </div>
  )
}

function RecordBody({ record }: { record: NonNullable<TodaySnapshot['today']> }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm text-stone-800 md:grid-cols-2">
      <div><dt className="text-stone-500">跟进</dt><dd>{record.customerNames || '无'}</dd></div>
      <div><dt className="text-stone-500">进展</dt><dd>{record.progress || '无'}</dd></div>
      <div><dt className="text-stone-500">未完成</dt><dd>{record.pending || '无'}</dd></div>
      <div><dt className="text-stone-500">明天</dt><dd>{record.tomorrow || '无'}</dd></div>
      <div className="md:col-span-2"><dt className="text-stone-500">备注</dt><dd>{record.notes || '无'}</dd></div>
    </dl>
  )
}

function CustomerSource({ snapshot }: { snapshot: TodaySnapshot }) {
  const { customers } = snapshot
  if (!customers.configured) return <p className="text-sm text-stone-500">云端 CRM 未配置，客户列表留空。</p>
  if (customers.source === 'error') return <p className="text-sm text-rose-700">{customers.message || '云端客户读取失败'}</p>
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-stone-500">{customers.source === 'cache' ? '缓存' : '云端'}</p>
      {customers.customers.length === 0 && <p className="text-sm text-stone-500">云端没有返回客户。</p>}
      <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
        {customers.customers.slice(0, 8).map(customer => (
          <li key={customer.id} className="px-3 py-2 text-sm">
            {customer.name || customer.id} · {customer.company || '无公司'}
          </li>
        ))}
      </ul>
    </div>
  )
}
