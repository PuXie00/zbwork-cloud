import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { startMcp } from '../workbench/mcp'
import { Workbench } from '../workbench/service'
import type { PageId, SaveHabitInput, SaveRecordInput, SaveScriptInput, SettingsPatch } from '../workbench/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'linux') app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId('zbwork')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let workbench: Workbench | null = null
let mcpClose: (() => Promise<void>) | null = null
let mcpStatus: { running: boolean; port: number; error: string | null } = { running: false, port: 3737, error: null }
let quitting = false
let reminderTimer: NodeJS.Timeout | null = null

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function showWindow(page?: PageId) {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page) win.webContents.send('workbench:open', page)
}

function notify(title: string, body: string, page: PageId) {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body })
  notification.on('click', () => showWindow(page))
  notification.show()
}

async function tickReminders() {
  if (!workbench) return
  const due = workbench.pendingReminders()
  for (const item of due) {
    workbench.acknowledgeReminder(item.fireKey)
    notify(item.title, item.body, item.page)
  }
}

async function applyRuntime() {
  if (!workbench) return
  const settings = workbench.getSettings()
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, openAsHidden: true })
  if (mcpClose) {
    await mcpClose()
    mcpClose = null
  }
  mcpStatus = { running: false, port: settings.mcpPort, error: null }
  if (!settings.mcpEnabled) return
  try {
    const server = await startMcp(workbench, { port: settings.mcpPort, token: settings.mcpToken })
    mcpClose = server.close
    mcpStatus = { running: true, port: server.port, error: null }
  } catch (error) {
    mcpStatus = {
      running: false,
      port: settings.mcpPort,
      error: error instanceof Error ? error.message : 'MCP 启动失败',
    }
  }
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'tray.png'))
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('珠宝外贸工作台')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开工作台', click: () => showWindow() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]))
    tray.on('click', () => showWindow())
  } catch (error) {
    console.error('托盘创建失败', error instanceof Error ? error.message : error)
  }
}

async function createWindow() {
  Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    title: '珠宝外贸工作台',
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#fafaf9',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('close', event => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
  })

  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
  else win.loadFile(indexHtml)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    if (!app.getLoginItemSettings().wasOpenedAtLogin) showWindow()
  })
}

function registerIpc() {
  const wb = () => {
    if (!workbench) throw new Error('工作台还没准备好')
    return workbench
  }
  ipcMain.handle('wb:getToday', () => wb().todaySnapshot())
  ipcMain.handle('wb:getRecord', (_event, date: string) => wb().getRecord(date))
  ipcMain.handle('wb:saveRecord', (_event, input: SaveRecordInput) => wb().saveRecord(input))
  ipcMain.handle('wb:listRecords', (_event, from: string, to: string) => wb().listRecords(from, to))
  ipcMain.handle('wb:markReviewed', (_event, date: string) => wb().markReviewed(date))
  ipcMain.handle('wb:listScripts', (_event, includeDisabled: boolean) => wb().listScripts(includeDisabled))
  ipcMain.handle('wb:saveScript', (_event, input: SaveScriptInput) => wb().saveScript(input))
  ipcMain.handle('wb:disableScript', (_event, id: string) => wb().disableScript(id))
  ipcMain.handle('wb:listHabits', () => wb().listHabits())
  ipcMain.handle('wb:saveHabit', (_event, input: SaveHabitInput) => wb().saveHabit(input))
  ipcMain.handle('wb:deleteHabit', (_event, id: string) => wb().deleteHabit(id))
  ipcMain.handle('wb:listCustomers', (_event, query?: string) => wb().listCustomers(query ?? ''))
  ipcMain.handle('wb:getCustomer', (_event, id: string) => wb().getCustomer(id))
  ipcMain.handle('wb:draftCrmNote', (_event, input: { date?: string; customerId?: string }) => wb().draftCrmNote(input ?? {}))
  ipcMain.handle('wb:getSettings', () => wb().getSettings())
  ipcMain.handle('wb:saveSettings', async (_event, patch: SettingsPatch) => {
    const settings = wb().updateSettings(patch)
    await applyRuntime()
    return settings
  })
  ipcMain.handle('wb:getMcpStatus', () => mcpStatus)
  ipcMain.handle('wb:copyText', (_event, text: string) => {
    clipboard.writeText(text)
  })
}

app.whenReady().then(async () => {
  workbench = await Workbench.open(path.join(app.getPath('userData'), 'workbench.sqlite'))
  registerIpc()
  createTray()
  await createWindow()
  await applyRuntime()
  await tickReminders()
  reminderTimer = setInterval(() => { void tickReminders() }, 20_000)
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  if (reminderTimer) clearInterval(reminderTimer)
  mcpClose?.().catch(() => undefined)
  workbench?.close()
})

app.on('window-all-closed', () => {
  win = null
})

app.on('second-instance', () => {
  showWindow()
})

app.on('activate', () => {
  showWindow()
})
