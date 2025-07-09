import initSqlJs, { Database } from "sql.js";

export async function readSqlFile(file: Blob) {
  const arrayBuffer = await file.arrayBuffer();
  return readSqlFileBuffer(arrayBuffer);
}

export async function readSqlFileBuffer(arrayBuffer: ArrayBuffer) {
  const SQL = await initSqlJs({
    locateFile: (file) => {
      if (file === "sql-wasm.wasm") {
        return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm";
      }
      return `https://sql.js.org/dist/${file}`;
    },
  });
  const db = new SQL.Database(new Uint8Array(arrayBuffer));
  return db;
}

export function readDbTables(db: Database) {
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  const tables = tablesRes.length > 0 ? tablesRes[0].values.flat() : [];
  return tables as string[];
}

export function getExplorerUrl(network: string) {
  switch (network) {
    case "Ethereum":
      return "https://etherscan.io";
    case "Binance":
      return "https://bscscan.com";
    case "Arbitrum":
      return "https://arbiscan.io";
    case "Polygon":
      return "https://polygonscan.com";
    case "Base":
      return "https://basescan.org";
    case "Solana":
      return "https://solscan.io";
    case "Snowtrace":
      return "https://snowtrace.io";
    case "Optimism":
      return "https://optimistic.etherscan.io";
    case "Gnosis":
      return "https://gnosisscan.io";
    case "Unichain":
      return "https://uniscan.xyz";
    case "Berachain":
      return "https://berascan.com";
    case "Sonic":
      return "https://sonicscan.org";
    case "Hyperevm":
      return "https://hyperevmscan.io";
  }
  return "https://blockscan.com";
}

export function decodeTerminationReason(reason: string) {
  switch (reason) {
    case "ntt":
      return `${reason}: No tracking tokens in pool`;
    case "bale":
      return `${reason}: Balancer id err`;
    case "bexe":
      return `${reason}: Balancer BEX id err`;
    case "bure":
      return `${reason}: Balancer BURR id err`;
    case "uv4e":
      return `${reason}: Uni v4 id err`;
    case "unk":
      return `${reason}: Unknown pool`;
    case "id":
      return `${reason}: Iterations disabled`;
  }
  return reason;
}
