declare module "mssql" {
  interface QueryResult {
    recordset: Record<string, unknown>[];
  }
  interface Request {
    query: (sql: string) => Promise<QueryResult>;
  }
  interface ConnectionPool {
    request: () => Request;
    close: () => Promise<void>;
  }
  export function connect(config: unknown): Promise<ConnectionPool>;
  const mssql: { connect: typeof connect };
  export default mssql;
}
