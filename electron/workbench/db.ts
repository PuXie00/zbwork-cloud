import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import initSqlJsModule from 'sql.js'
import type { Database as SqlDatabase, SqlJsStatic } from 'sql.js'

const require = createRequire(import.meta.url)

let sqlPromise: Promise<SqlJsStatic> | null = null

async function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const initSqlJs = typeof initSqlJsModule === 'function'
      ? initSqlJsModule
      : (initSqlJsModule as { default: typeof initSqlJsModule }).default
    sqlPromise = initSqlJs({ locateFile: () => wasmPath })
  }
  return sqlPromise
}

export type SqlParam = string | number | null

export function queryAll(db: SqlDatabase, sql: string, params: SqlParam[] = []): Record<string, string | number | null>[] {
  const stmt = db.prepare(sql)
  try {
    if (params.length > 0) stmt.bind(params)
    const rows: Record<string, string | number | null>[] = []
    while (stmt.step()) {
      const raw = stmt.getAsObject()
      const row: Record<string, string | number | null> = {}
      for (const [key, value] of Object.entries(raw)) {
        row[key] = typeof value === 'string' || typeof value === 'number' || value === null ? value : null
      }
      rows.push(row)
    }
    return rows
  } finally {
    stmt.free()
  }
}

export function queryOne(db: SqlDatabase, sql: string, params: SqlParam[] = []): Record<string, string | number | null> | null {
  return queryAll(db, sql, params)[0] ?? null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_records (
  record_date TEXT PRIMARY KEY,
  customer_ids TEXT NOT NULL,
  customer_names TEXT NOT NULL,
  progress TEXT NOT NULL,
  pending TEXT NOT NULL,
  tomorrow TEXT NOT NULL,
  notes TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS reminder_fires (
  fire_key TEXT PRIMARY KEY,
  fired_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reply_habits (
  id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  structure TEXT NOT NULL,
  example TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  cached_at TEXT NOT NULL
);
`

function ensureCustomerCacheColumns(db: SqlDatabase): void {
  const columns = new Set(queryAll(db, 'PRAGMA table_info(customer_cache)').map(row => String(row.name)))
  if (!columns.has('country')) db.run("ALTER TABLE customer_cache ADD COLUMN country TEXT NOT NULL DEFAULT ''")
  if (!columns.has('source')) db.run("ALTER TABLE customer_cache ADD COLUMN source TEXT NOT NULL DEFAULT ''")
}

export class WorkbenchDb {
  private constructor(
    readonly db: SqlDatabase,
    private readonly filename: string | null,
  ) {}

  static async open(filename: string): Promise<WorkbenchDb> {
    const SQL = await loadSql()
    const memory = filename === ':memory:'
    if (!memory) fs.mkdirSync(path.dirname(filename), { recursive: true })
    const existing = !memory && fs.existsSync(filename) ? fs.readFileSync(filename) : null
    const db = existing ? new SQL.Database(existing) : new SQL.Database()
    const store = new WorkbenchDb(db, memory ? null : filename)
    db.run(SCHEMA)
    ensureCustomerCacheColumns(db)
    store.ensureDefaults()
    store.persist()
    return store
  }

  persist(): void {
    if (!this.filename) return
    const data = this.db.export()
    const tmp = `${this.filename}.tmp`
    fs.writeFileSync(tmp, Buffer.from(data))
    fs.renameSync(tmp, this.filename)
  }

  close(): void {
    this.persist()
    this.db.close()
  }

  private ensureDefaults(): void {
    const defaults: Record<string, string> = {
      mcp_port: '3737',
      mcp_token: randomBytes(24).toString('base64url'),
      mcp_enabled: '1',
      crm_base_url: 'https://admin.silverbene.com',
      crm_username: '',
      crm_password: '',
      crm_timeout_ms: '8000',
      remind_write_first: '16:00',
      remind_write_second: '17:00',
      remind_review: '10:00',
      open_at_login: '0',
    }
    for (const [key, value] of Object.entries(defaults)) {
      const row = queryOne(this.db, 'SELECT value FROM settings WHERE key = ?', [key])
      if (!row) this.db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
    }
  }
}
