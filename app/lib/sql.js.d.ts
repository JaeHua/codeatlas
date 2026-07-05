declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }

  interface Database {
    run(sql: string): void
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  interface Statement {
    bind(params?: any[]): void
    step(): boolean
    getAsObject(): Record<string, any>
    free(): void
    reset(): void
  }

  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
  export default initSqlJs
  export type { Database as Database, Statement as Statement, SqlJsStatic as SqlJsStatic }
}
