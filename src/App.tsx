import { BookMarked, House, NotebookPen, Settings, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PageId } from '../electron/workbench/types'
import { CustomersPage } from './workbench/CustomersPage'
import { HomePage } from './workbench/HomePage'
import { KnowledgePage } from './workbench/KnowledgePage'
import { RecordPage } from './workbench/RecordPage'
import { SettingsPage } from './workbench/SettingsPage'

const NAV: { id: PageId; label: string; icon: typeof House }[] = [
  { id: 'home', label: '首页', icon: House },
  { id: 'record', label: '每日记录', icon: NotebookPen },
  { id: 'customers', label: '客户', icon: Users },
  { id: 'knowledge', label: '知识库', icon: BookMarked },
  { id: 'settings', label: '设置', icon: Settings },
]

const App = () => {
  const [page, setPage] = useState<PageId>('home')

  useEffect(() => {
    if (!window.workbench) return
    return window.workbench.onOpen(next => setPage(next))
  }, [])

  if (!window.workbench) {
    return <p className="p-8 text-sm text-stone-600">请在 Electron 工作台中打开。</p>
  }

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900">
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-3" aria-label="工作台">
        <p className="px-3 py-2 text-sm font-semibold">珠宝外贸</p>
        {NAV.map(item => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setPage(item.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${active ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
            >
              <Icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>
      <main className="min-w-0 flex-1 overflow-auto p-8">
        {page === 'home' && <HomePage onWrite={() => setPage('record')} />}
        {page === 'record' && <RecordPage />}
        {page === 'customers' && <CustomersPage />}
        {page === 'knowledge' && <KnowledgePage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
