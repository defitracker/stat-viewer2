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

const TERMINATION_EXACT: Record<string, string> = {
  ntt: "No tracking tokens in pool",
  bale: "Balancer id err",
  bexe: "Balancer BEX id err",
  bure: "Balancer BURR id err",
  uv4e: "Uni v4 id err",
  unk: "Unknown pool",
  id: "Iterations disabled",
  // iteration2-era codes
  "!active": "Token not active",
  hidden: "Token hidden",
  debounce: "Debounced (too soon after previous event)",
  no_token_name: "CEX trade carried no token name",
  no_cex_config: "No cex section in config",
  no_cex_nd_token: "Token has no network data for this CEX",
  cex_id: "CEX iterations disabled (cex.itersEnabled)",
  cex_ev_d: "CEX events disabled (cex.eventsEnabled)",
};

// Codes that arrive with a suffix, e.g. "NNDB TOKEN Ethereum".
const TERMINATION_PREFIX: [string, string][] = [
  ["group_ladder_failed", "Group buy ladder failed"],
  ["ladder_failed", "Buy ladder failed"],
  ["network_disabled", "Network disabled (region gating)"],
  ["no quote transport", "No LA/Jupiter/CEX transport for network"],
  ["no_la_na", "No LA config for network"],
  ["no_cex_nd", "Token has no network data for this CEX"],
  ["NNDB", "No token network data for counterparty"],
  ["NSRCB", "No src token for counterparty"],
  ["HNP", "Token has no pools on counterparty"],
  ["No TVs", "No tracking values for pair"],
  ["id ", "Iterations disabled for network"],
];

export function decodeTerminationReason(reason: string) {
  if (TERMINATION_EXACT[reason]) return `${reason}: ${TERMINATION_EXACT[reason]}`;
  for (const [prefix, desc] of TERMINATION_PREFIX) {
    if (reason?.startsWith?.(prefix)) return `${reason} — ${desc}`;
  }
  return reason;
}
