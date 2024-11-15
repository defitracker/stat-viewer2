import initSqlJs, { Database } from "sql.js";

export async function readSqlFile(file: Blob) {
  const arrayBuffer = await file.arrayBuffer();
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const db = new SQL.Database(new Uint8Array(arrayBuffer));
  return db;
}

export function readDbTables(db: Database) {
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  const tables = tablesRes.length > 0 ? tablesRes[0].values.flat() : [];
  return tables as string[];
}
