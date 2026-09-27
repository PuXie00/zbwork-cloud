declare module 'sql.js' {
  export interface Statement {
    bind(values?: Array<string | number | null | Uint8Array>): boolean
    step(): boolean
    getAsObject(): Record<string, string | number | null | Uint8Array>
    free(): boolean
  }

  export interface Database {
    run(sql: string, params?: Array<string | number | null | Uint8Array>): Database
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }

  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
  export default initSqlJs
}
