import { useEffect, useState } from 'react'
import { SCENES } from '../../electron/workbench/types'
import type { ReplyHabit, Scene, Script } from '../../electron/workbench/types'
import { getWorkbench } from './api'
import { Button, ErrorText, Field, TextArea, TextInput } from './ui'

export function KnowledgePage() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [habits, setHabits] = useState<ReplyHabit[]>([])
  const [error, setError] = useState('')
  const [scriptForm, setScriptForm] = useState({ id: '', scene: '报价' as Scene, title: '', body: '', tags: '' })
  const [habitForm, setHabitForm] = useState({ id: '', scene: '报价' as Scene, structure: '', example: '' })

  const load = async () => {
    const api = getWorkbench()
    setScripts(await api.listScripts(true))
    setHabits(await api.listHabits())
  }

  useEffect(() => {
    void load().catch(err => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const handleSaveScript = async () => {
    setError('')
    try {
      await getWorkbench().saveScript({
        id: scriptForm.id || undefined,
        scene: scriptForm.scene,
        title: scriptForm.title,
        body: scriptForm.body,
        tags: scriptForm.tags,
      })
      setScriptForm({ id: '', scene: scriptForm.scene, title: '', body: '', tags: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const handleSaveHabit = async () => {
    setError('')
    try {
      await getWorkbench().saveHabit({
        id: habitForm.id || undefined,
        scene: habitForm.scene,
        structure: habitForm.structure,
        example: habitForm.example,
      })
      setHabitForm({ id: '', scene: habitForm.scene, structure: '', example: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">知识库</h1>
      <ErrorText>{error}</ErrorText>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">常用回复话术</h2>
        <form className="grid gap-3 rounded-md border border-stone-200 bg-white p-4" onSubmit={event => { event.preventDefault(); void handleSaveScript() }}>
          <SceneSelect value={scriptForm.scene} onChange={scene => setScriptForm({ ...scriptForm, scene })} />
          <Field label="标题"><TextInput value={scriptForm.title} onChange={event => setScriptForm({ ...scriptForm, title: event.target.value })} /></Field>
          <Field label="正文"><TextArea value={scriptForm.body} onChange={event => setScriptForm({ ...scriptForm, body: event.target.value })} /></Field>
          <Field label="标签"><TextInput value={scriptForm.tags} onChange={event => setScriptForm({ ...scriptForm, tags: event.target.value })} placeholder="材质、电镀、宝石、MOQ、交期" /></Field>
          <Button type="submit">{scriptForm.id ? '更新话术' : '保存话术'}</Button>
        </form>
        <ul className="space-y-3">
          {scripts.map(script => (
            <li key={script.id} className="rounded-md border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-stone-500">{script.scene} · {script.enabled ? '启用' : '停用'}</p>
                  <h3 className="font-medium">{script.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{script.body}</p>
                  {script.tags && <p className="mt-2 text-xs text-stone-500">{script.tags}</p>}
                </div>
                <div className="flex gap-2">
                  <Button type="button" tone="ghost" onClick={() => setScriptForm({ id: script.id, scene: script.scene, title: script.title, body: script.body, tags: script.tags })}>编辑</Button>
                  {script.enabled && <Button type="button" tone="ghost" onClick={() => void getWorkbench().disableScript(script.id).then(load)}>停用</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">回复习惯</h2>
        <p className="text-sm text-stone-600">只有你点保存，才会记成习惯。</p>
        <form className="grid gap-3 rounded-md border border-stone-200 bg-white p-4" onSubmit={event => { event.preventDefault(); void handleSaveHabit() }}>
          <SceneSelect value={habitForm.scene} onChange={scene => setHabitForm({ ...habitForm, scene })} />
          <Field label="结构说明"><TextArea value={habitForm.structure} onChange={event => setHabitForm({ ...habitForm, structure: event.target.value })} placeholder="先问什么、报价怎么排、常用收尾" /></Field>
          <Field label="例句"><TextArea value={habitForm.example} onChange={event => setHabitForm({ ...habitForm, example: event.target.value })} /></Field>
          <Button type="submit">按这个记</Button>
        </form>
        <ul className="space-y-3">
          {habits.map(habit => (
            <li key={habit.id} className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">{habit.scene}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{habit.structure}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{habit.example}</p>
              <div className="mt-3 flex gap-2">
                <Button type="button" tone="ghost" onClick={() => setHabitForm({ id: habit.id, scene: habit.scene, structure: habit.structure, example: habit.example })}>编辑</Button>
                <Button type="button" tone="ghost" onClick={() => void getWorkbench().deleteHabit(habit.id).then(load)}>删除</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SceneSelect({ value, onChange }: { value: Scene; onChange: (scene: Scene) => void }) {
  return (
    <Field label="场景">
      <select className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" value={value} onChange={event => onChange(event.target.value as Scene)} aria-label="场景">
        {SCENES.map(scene => <option key={scene} value={scene}>{scene}</option>)}
      </select>
    </Field>
  )
}
