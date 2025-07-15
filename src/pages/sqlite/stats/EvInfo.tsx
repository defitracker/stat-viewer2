import { useSqliteStore } from "@/util/sqliteStore";
import { Database } from "sql.js";
import { useShallow } from "zustand/react/shallow";

import ReactJson from "react-json-view";

export const tableName = "EvInfo";

let global_analytics: any | null = null;

export function computeStats() {
  const { db, tables } = useSqliteStore(
    useShallow((state) => ({
      db: state.db,
      tables: state.tables,
    }))
  );

  if (!db) return <></>;
  if (!tables.includes(tableName)) return <></>;

  if (global_analytics === null) {
    global_analytics = getAnalytics(db);
  }

  //   console.log("analytics", global_analytics);

  return (
    <>
      <ReactJson
        name={`${tableName}_stats`}
        collapsed={1}
        enableClipboard={false}
        src={global_analytics}
        displayObjectSize={false}
        displayDataTypes={false}
        quotesOnKeys={false}
      />
      {/* <div><pre>{JSON.stringify(global_analytics, null, 2)}</pre></div> */}
    </>
  );
}

function getAnalytics(db: Database) {
  console.log(`computing ${tableName} stats...`);
  const tableData = db.exec(`SELECT * FROM ${tableName};`)[0];
  //   console.log("res", tableData);

  // 1) build a name→index map
  const idx = tableData.columns.reduce((acc, name, i) => {
    acc[name] = i;
    return acc;
  }, {} as Record<string, number>);

  // 2) group rows by network + txHash
  //    Map<"network|txHash", { network, entries: Array<{multiId, time}> }>
  const groups = new Map<
    string,
    {
      [multiId: string]: number;
    }
  >();
  for (const row of tableData.values) {
    const network = row[idx.network]?.toString() ?? "";
    const txHash = row[idx.tx_hash]?.toString() ?? "";
    const multiId = row[idx.multi_id]?.toString() ?? "";
    const time = parseInt(row[idx.receive_time]?.toString() ?? "0");

    const key = network + "|" + txHash;
    if (!groups.has(key)) {
      groups.set(key, {});
    }
    groups.get(key)![multiId] = time;
  }

  //   console.log("groups", groups);

  // prepare accumulators
  const firstCounts: { [network: string]: { [multiId: string]: number } } = {};
  const lags: any = {};

  type LagData = {
    txHash: string;
    lag: number;
  };

  // 3) for each event, find earliest provider & tally
  for (const [key, values] of groups.entries()) {
    const [network, txHash] = key.split("|");
    const entries = Object.entries(values);

    if (entries.length < 2) continue; // need at least two providers

    // find the earliest entry
    let first = entries[0];
    for (const e of entries) {
      const [, time] = e;
      if (time < first[1]) first = e;
    }

    // ensure init structures
    firstCounts[network] ||= {};
    lags[network] ||= {};

    // count firsts
    firstCounts[network][first[0]] = (firstCounts[network][first[0]] || 0) + 1;

    // accumulate lags: otherProviderTime - firstProviderTime
    for (const e of entries) {
      if (e[0] === first[0]) continue;
      const lag = e[1] - first[1];

      lags[network][first[0]] ||= {};

      lags[network][first[0]][e[0]] ||= [];
      lags[network][first[0]][e[0]].push({ txHash, lag });
    }
  }

  //   console.log("lagSums", lagSums);
  //   console.log("lags", lags);

  // 4) build final analytics with averages
  const analytics: {
    [network: string]: any;
  } = {};

  for (const network of Object.keys(firstCounts)) {
    analytics[network] = {
      firstCounts: { ...firstCounts[network] },
    };
  }

  for (const [network, networkLags] of Object.entries(lags)) {
    analytics[network].lags = {};

    for (const [multiRpcAhead, multiRpcNetworkLags] of Object.entries(networkLags as any)) {
      analytics[network].lags[multiRpcAhead] = {};
      for (const [multiRpcBehind, _lagsData] of Object.entries(multiRpcNetworkLags as any)) {
        analytics[network].lags[multiRpcAhead][multiRpcBehind] = {};

        const lagsData = _lagsData as LagData[];
        const justLagsArray = lagsData.map((ld) => ld.lag);
        justLagsArray.sort((a, b) => a - b);

        analytics[network].lags[multiRpcAhead][multiRpcBehind].default = getStats(justLagsArray);
        analytics[network].lags[multiRpcAhead][multiRpcBehind].noOutliers = getStats(filterOutOutliers(justLagsArray));
      }
    }
  }

  return analytics;
}

function getQuartile(sortedArr: number[], quartile: number) {
  const pos = (sortedArr.length - 1) * quartile;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) {
    return sortedArr[lower];
  }
  // Linear interpolation between two values.
  return sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (pos - lower);
}

function filterOutOutliers(sortedArr: number[]) {
  if (sortedArr.length === 0) return [];

  const Q1 = getQuartile(sortedArr, 0.25);
  const Q3 = getQuartile(sortedArr, 0.75);
  const IQR = Q3 - Q1;
  const lowerBound = Q1 - 1.5 * IQR;
  //   const upperBound = Q3 + 1.5 * IQR;
  const upperBound = Q3 + 3 * IQR;

  //   const lowerOutliers = sortedArr.filter((v) => v < lowerBound);
  const noUpperOutliers = sortedArr.filter((v) => v <= upperBound);

  return noUpperOutliers;
}

function getStats(sortedArr: number[]) {
  const n = sortedArr.length;

  let stats = {
    total: 0,
    min: 0,
    max: 0,
    mean: 0,
    med: 0,
    stdev: 0,
  };

  if (n === 0) return stats;

  stats.total = n;
  stats.min = sortedArr[0];
  stats.max = sortedArr[n - 1];
  stats.mean = sortedArr.reduce((acc, val) => acc + val, 0) / n;

  // Median
  {
    const mid = Math.floor(n / 2);
    if (n % 2 !== 0) {
      stats.med = sortedArr[mid];
    } else {
      stats.med = (sortedArr[mid - 1] + sortedArr[mid]) / 2;
    }
  }

  // Stdev
  {
    const squaredDiffs = sortedArr.map((val) => {
      const diff = val - stats.mean;
      return diff * diff;
    });
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / n;
    stats.stdev = Math.sqrt(variance);
  }

  return stats;
}
