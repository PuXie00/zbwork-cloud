import { useEffect, useState } from 'react'
import { addDays, shanghaiClock } from '../../electron/workbench/time'
import type { DailyRecord } from '../../electron/workbench/types'
import { getWorkbench } from './api'
import { Button, ErrorText, Field, TextArea, TextInput } from './ui'

const empty = {
  customerIds: '',
  customerNames: '',
  progress: '',
  pending: '',
  tomorrow: '',
  notes: '',
}

export function RecordPage() {
  const today = shanghaiClock(new Date()).date
  const [date, setDate] = useState(today)
  const [form, setForm] = useState(empty)
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = async (recordDate: string) => {
    const api = getWorkbench()
    const record = await api.getRecord(recordDate)
    setForm(record ? {
      customerIds: record.customerIds.join(', '),
      customerNames: record.customerNames,
      progress: record.progress,
      pending: record.pending,
      tomorrow: record.tomorrow,
      notes: record.notes,
    } : empty)
    setRecords(await api.listRecords(addDays(recordDate, -30), recordDate))
  }

  useEffect(() => {
    void load(date).catch(err => setError(err instanceof Error ? err.message : '加载失败'))
  }, [date])

  const handleSave = async () => {
    setError('')
    setSaved('')
    try {
      await getWorkbench().saveRecord({
        date,
        customerIds: form.customerIds.split(/[,，]/).map(item => item.trim()).filter(Boolean),
        customerNames: form.customerNames,
        progress: form.progress,
        pending: form.pending,
        tomorrow: form.tomorrow,
        notes: form.notes,
      })
      setSaved('已保存')
      await load(date)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void handleSave() }}>
        <h1 className="text-2xl font-semibold">每日记录</h1>
        <Field label="日期">
          <TextInput type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="记录日期" />
        </Field>
        <Field label="云端客户 id">
          <TextInput value={form.customerIds} onChange={event => setForm({ ...form, customerIds: event.target.value })} placeholder="多个用逗号分隔" />
        </Field>
        <Field label="跟进了哪些客户">
          <TextArea value={form.customerNames} onChange={event => setForm({ ...form, customerNames: event.target.value })} />
        </Field>
        <Field label="询盘、报价、样品、订单进展">
          <TextArea value={form.progress} onChange={event => setForm({ ...form, progress: event.target.value })} />
        </Field>
        <Field label="今天没回完的事项">
          <TextArea value={form.pending} onChange={event => setForm({ ...form, pending: event.target.value })} />
        </Field>
        <Field label="明天先做什么">
          <TextArea value={form.tomorrow} onChange={event => setForm({ ...form, tomorrow: event.target.value })} />
        </Field>
        <Field label="备注">
          <TextArea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit">保存</Button>
          {saved && <span className="text-sm text-stone-600">{saved}</span>}
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
      <aside className="space-y-2">
        <h2 className="text-sm font-medium text-stone-500">最近记录</h2>
        <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
          {records.map(record => (
            <li key={record.date}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => setDate(record.date)}>
                {record.date} {record.customerNames ? `· ${record.customerNames}` : ''}
              </button>
            </li>
          ))}
          {records.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">这个区间还没有记录</li>}
        </ul>
      </aside>
    </div>
  )
}
