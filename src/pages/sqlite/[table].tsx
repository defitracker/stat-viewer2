import { useSqliteStore } from "@/util/sqliteStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { AgGridReact } from "ag-grid-react";
import SQLiteLayout from "./_layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { decodeTerminationReason, getExplorerUrl } from "@/util/helper";
import { toast } from "@/util/toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import BigNumber from "bignumber.js";
import { Star } from "lucide-react";
import * as idb from "@/util/idb";

import { FunctionPlotOptions } from "function-plot";
import { FunctionPlot, renderIter2Value } from "@/components/Iter2Views";

// Values of the linkable members double as table names for the click-through
// fetch in renderValueWithType.
enum ValueType {
  Event = "Event",
  Iteration = "Iteration",
  Iteration2 = "Iteration2",
  IterationGroup = "IterationGroup",

  _Address = "_Address",
  _TxHash = "_TxHash",
  _BlockNumber = "_BlockNumber",
  _Timestemp = "_Timestemp",

  Unknown = "Unknown",
}

function buildExplorerFullUrl(explorerUrl: string, valueType: ValueType, value: string) {
  if (valueType === ValueType._Address) return `${explorerUrl}/address/${value}`;
  if (valueType === ValueType._TxHash) return `${explorerUrl}/tx/${value}`;
  if (valueType === ValueType._BlockNumber) return `${explorerUrl}/block/${value}`;
  return "#";
}

function bringColumnsValuesToItem(columns: string[], values: any[]) {
  return Object.fromEntries(columns.map((c, i) => [c, values[i]])) as Record<string, any>;
}

// eventId (the cause) reads better before groupId (its consequence) in the
// detail dialog — reorder the row list when both are present.
function orderedEntries(item: Record<string, any>): [string, any][] {
  const entries = Object.entries(item);
  const gi = entries.findIndex(([k]) => k === "groupId");
  const ei = entries.findIndex(([k]) => k === "eventId");
  if (gi !== -1 && ei !== -1 && ei > gi) {
    const [ev] = entries.splice(ei, 1);
    entries.splice(gi, 0, ev);
  }
  return entries;
}

// Port of worker-rust iteration/linest.rs (f64 == JS number): exact parabola through
// 3 points (divided differences), centered/scaled least squares for more. Lets the
// viewer overlay the corrected fit against the stored coefficients — on files from
// old binaries the two diverge wherever the f32 fit was broken; on new binaries they
// coincide.
function computeExactFit(tvs: number[], profits: number[]): { a: number; b: number; c: number; vertex: number; est: number } | undefined {
  const n = tvs.length;
  if (n !== profits.length || n < 3) return undefined;
  let a: number, b: number, c: number;
  if (n === 3) {
    const [x0, x1, x2] = tvs;
    const [y0, y1, y2] = profits;
    const d01 = x1 - x0, d12 = x2 - x1, d02 = x2 - x0;
    if (!d01 || !d12 || !d02) return undefined;
    const s1 = (y1 - y0) / d01, s2 = (y2 - y1) / d12;
    a = (s2 - s1) / d02;
    b = s1 - a * (x0 + x1);
    c = y0 - x0 * (b + a * x0);
  } else {
    const m = tvs.reduce((acc, v) => acc + v, 0) / n;
    const s = tvs.reduce((acc, v) => Math.max(acc, Math.abs(v - m)), 0);
    if (!s) return undefined;
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (let i = 0; i < n; i++) {
      const u = (tvs[i] - m) / s, u2 = u * u, y = profits[i];
      s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
      t0 += y; t1 += u * y; t2 += u2 * y;
    }
    const det = n * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-12) return undefined;
    const C = (t0 * (s2 * s4 - s3 * s3) - s1 * (t1 * s4 - s3 * t2) + s2 * (t1 * s3 - s2 * t2)) / det;
    const B = (n * (t1 * s4 - t2 * s3) - t0 * (s1 * s4 - s3 * s2) + s2 * (s1 * t2 - s2 * t1)) / det;
    const A = (n * (s2 * t2 - s3 * t1) - s1 * (s1 * t2 - t1 * s2) + t0 * (s1 * s3 - s2 * s2)) / det;
    a = A / (s * s);
    b = B / s - (2 * A * m) / (s * s);
    c = C - (B * m) / s + (A * m * m) / (s * s);
  }
  if (!a || !isFinite(a) || !isFinite(b) || !isFinite(c)) return undefined;
  const vertex = -b / (2 * a);
  return { a, b, c, vertex, est: c + b * vertex + a * vertex * vertex };
}

function Plot({ rootCtx, extrKey }: { rootCtx: Record<string, any>; extrKey: string }) {
  const { tvResultsJsonList } = rootCtx;
  const extremumRes = (() => {
    try {
      return JSON.parse(rootCtx[extrKey]);
    } catch (e) {}
  })();
  if (!extremumRes) return <></>;

  const { a, b, c, tvs, profits } = extremumRes;
  const fn = `${BigNumber(a).toString(10)}x^2 + ${BigNumber(b).toString(10)}x + ${BigNumber(c).toString(10)}`;

  const extremum = BigNumber(extremumRes.extremum);
  const estimatedProfit = BigNumber(extremumRes.estimatedProfit);

  const exactFit = (() => {
    try {
      return computeExactFit(
        (tvs ?? []).map((v: any) => BigNumber(v).toNumber()),
        (profits ?? []).map((v: any) => BigNumber(v).toNumber())
      );
    } catch (e) {
      return undefined;
    }
  })();

  // Worker-stored legacy-f32 fit (oldFitExtremumResJson) + its dual-verification
  // quote — present on files from binaries with dual-fit analytics. Rendered only on
  // the 3-pt plot (the old fit is computed over the same slice as extremumResJson).
  const oldFit = (() => {
    if (extrKey !== "extremumResJson") return undefined;
    try {
      const parsed = JSON.parse(rootCtx["oldFitExtremumResJson"]);
      return parsed && isFinite(Number(parsed.a)) ? parsed : undefined;
    } catch (e) {
      return undefined;
    }
  })();
  const oldFitTvRes = (() => {
    if (extrKey !== "extremumResJson") return undefined;
    try {
      return JSON.parse(rootCtx["oldFitExtremumTvResJson"]);
    } catch (e) {
      return undefined;
    }
  })();
  // stored == exact (new binary): skip the duplicate overlay
  const exactDiffers =
    exactFit !== undefined &&
    (Math.abs(exactFit.a - Number(a)) > 1e-4 * Math.max(1, Math.abs(exactFit.a)) ||
      Math.abs(exactFit.vertex - extremum.toNumber()) > 1e-4);

  const tvPoints = [];
  if (tvs && profits) {
    for (let i = 0; i < tvs.length; i++) {
      tvPoints.push([BigNumber(tvs[i]).toNumber(), BigNumber(profits[i]).toNumber()]);
    }
  }

  const extremumTvRes = (() => {
    try {
      const tvResults = JSON.parse(tvResultsJsonList);
      return tvResults.find((tvRes: any) => {
        return parseFloat(BigNumber(tvRes.buyAmount).minus(extremum).abs().toString()) < 0.0001;
      });
    } catch (e) {
      return undefined;
    }
  })();

  let domain_x1 = Math.min(0, ...tvPoints.map((p) => p[0]));
  let domain_x2 = Math.max(0, ...tvPoints.map((p) => p[0]));
  let domain_y1 = Math.min(0, ...tvPoints.map((p) => p[1]));
  let domain_y2 = Math.max(0, ...tvPoints.map((p) => p[1]));

  if (estimatedProfit.toNumber() > domain_y2) {
    domain_y2 = estimatedProfit.toNumber();
  }

  const data: FunctionPlotOptions["data"] = [];
  data.push({ fn });
  if (oldFit) {
    data.push({
      fn: `${BigNumber(oldFit.a).toString(10)}x^2 + ${BigNumber(oldFit.b).toString(10)}x + ${BigNumber(oldFit.c).toString(10)}`,
      color: "gray",
    });
    data.push({
      fnType: "points",
      graphType: "scatter",
      color: "gray",
      attr: { r: 3.3 },
      points: [[BigNumber(oldFit.extremum).toNumber(), BigNumber(oldFit.estimatedProfit).toNumber()]],
    });
  }
  if (oldFitTvRes) {
    const oldVerifiedProfit =
      parseFloat(oldFitTvRes.sellReturnAmount) / 10 ** 18 - oldFitTvRes.buyAmount;
    data.push({
      fnType: "points",
      graphType: "scatter",
      color: "darkolivegreen",
      attr: { r: 3 },
      points: [[oldFitTvRes.buyAmount, oldVerifiedProfit]],
    });
    if (oldVerifiedProfit > domain_y2) {
      domain_y2 = oldVerifiedProfit;
    }
  }
  if (exactDiffers && exactFit) {
    data.push({
      fn: `${BigNumber(exactFit.a).toString(10)}x^2 + ${BigNumber(exactFit.b).toString(10)}x + ${BigNumber(exactFit.c).toString(10)}`,
      color: "orange",
    });
    data.push({
      fnType: "points",
      graphType: "scatter",
      color: "orange",
      attr: { r: 3.3 },
      points: [[exactFit.vertex, exactFit.est]],
    });
    if (exactFit.est > domain_y2 && isFinite(exactFit.est)) {
      domain_y2 = exactFit.est;
    }
  }
  data.push({
    fnType: "points",
    graphType: "scatter",
    color: "red",
    attr: { r: 3 },
    points: tvPoints,
  });
  data.push({
    fnType: "points",
    graphType: "scatter",
    color: "purple",
    attr: { r: 3.3 },
    points: [[extremum.toNumber(), estimatedProfit.toNumber()]],
  });

  if (extremumTvRes) {
    const profit = parseFloat(extremumTvRes.sellReturnAmount) / 10 ** 18 - extremumTvRes.buyAmount;
    data.push({
      fnType: "points",
      graphType: "scatter",
      color: "green",
      attr: { r: 3 },
      points: [[extremumTvRes.buyAmount, profit]],
    });

    if (profit > domain_y2) {
      domain_y2 = profit;
    }
  }

  if (domain_x2 == 0) {
    domain_x2 = 1;
  }

  return (
    <div>
      <FunctionPlot
        options={{
          target: "",
          width: 600,
          height: 300,
          yAxis: { domain: [domain_y1, Math.max(0.02, domain_y2 * 1.2)] },
          xAxis: { domain: [domain_x1, domain_x2 * 1.05] },
          grid: true,
          data,
        }}
      />
      <div style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 8px" }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: "red" }}>● sampled tv quotes</span>
          <span style={{ color: "purple", marginLeft: 10 }}>● stored-fit vertex (est)</span>
          <span style={{ color: "green", marginLeft: 10 }}>● verified @ new vertex</span>
          {oldFit && <span style={{ color: "gray", marginLeft: 10 }}>— old-f32 fit</span>}
          {oldFitTvRes && (
            <span style={{ color: "darkolivegreen", marginLeft: 10 }}>● verified @ old vertex</span>
          )}
          {exactDiffers && <span style={{ color: "darkorange", marginLeft: 10 }}>— exact-f64 fit</span>}
        </div>
        <span style={{ color: "steelblue" }}>
          stored: vertex={extremum.toFixed(6)} est={estimatedProfit.toFixed(6)}
        </span>
        {exactFit && (
          <span style={{ color: "darkorange", marginLeft: 12 }}>
            {exactDiffers ? "exact-f64" : "exact-f64 (= stored)"}: vertex={exactFit.vertex.toFixed(6)} est=
            {exactFit.est.toFixed(6)} a={exactFit.a.toExponential(3)}
          </span>
        )}
        {oldFit && (
          <span style={{ color: "gray", marginLeft: 12 }}>
            old-f32: vertex={BigNumber(oldFit.extremum).toFixed(6)} est=
            {BigNumber(oldFit.estimatedProfit).toFixed(6)}
            {oldFitTvRes ? " (dual-verified)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TablePage() {
  const params = useParams();
  const navigate = useNavigate();
  const { db } = useSqliteStore(
    useShallow((state) => ({
      db: state.db,
    }))
  );

  const tableName = params.table;

  useEffect(() => {
    if (!tableName || !db) {
      navigate("/");
    }
  }, [tableName, db]);

  if (!tableName) return <></>;
  if (!db) return <></>;

  const res = useMemo(() => {
    const t1 = Date.now();
    console.log(`Selecting * from ${tableName}`);
    const res = db.exec(`SELECT * FROM ${tableName};`)[0];
    console.log(`Selected in`, Date.now() - t1);
    return res;
  }, [tableName]);

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const filename = useSqliteStore((state) => state.filename);
  const pinnedVersion = useSqliteStore((state) => state.pinnedVersion);

  const loadPinnedIds = useCallback(async () => {
    if (!filename) return;
    const entries = await idb.getPinnedEntries(filename);
    setPinnedIds(new Set(entries.map((e) => `${e.table}-${e.entryId}`)));
  }, [filename]);

  useEffect(() => {
    loadPinnedIds();
  }, [loadPinnedIds, pinnedVersion]);

  const togglePin = async (table: string, entryId: string) => {
    if (!filename) return;
    const key = `${table}-${entryId}`;
    if (pinnedIds.has(key)) {
      const entries = await idb.getPinnedEntries(filename);
      const entry = entries.find((e) => e.table === table && e.entryId === entryId);
      if (entry?.id != null) await idb.deletePinnedEntry(entry.id);
    } else {
      await idb.addPinnedEntry(filename, table, entryId);
    }
    await loadPinnedIds();
    const refresh = (useSqliteStore.getState() as any)._refreshPinnedEntries;
    if (refresh) refresh();
  };

  const extraColumns = useMemo(() => {
    const extra: { field: string; afterColumn?: string; maxWidth?: number; cellStyle?: (params: any) => any; extractFn: (row: Record<string, any>) => any }[] = [];
    if (tableName === "Iteration" && res.columns.includes("selectedBestBuySellResJson")) {
      extra.push({
        field: "TV",
        afterColumn: "tokenId",
        maxWidth: 140,
        extractFn: (row) => {
          try {
            const json = JSON.parse(row.selectedBestBuySellResJson);
            const val = json.selectedBestTv;
            return val != null ? parseFloat(parseFloat(val).toFixed(4)) : null;
          } catch {
            return null;
          }
        },
      });
      extra.push({
        field: "profit",
        afterColumn: "TV",
        maxWidth: 140,
        cellStyle: (params: any) => {
          const val = parseFloat(params.value);
          if (!isNaN(val) && val > 0) return { backgroundColor: "rgba(34, 197, 94, 0.07)" };
          return null;
        },
        extractFn: (row) => {
          try {
            const json = JSON.parse(row.selectedBestBuySellResJson);
            const val = json.selectedBestTvProfit;
            return val != null ? parseFloat(parseFloat(val).toFixed(4)) : null;
          } catch {
            return null;
          }
        },
      });
    }
    if (tableName === "Iteration" && (res.columns.includes("networkA") || res.columns.includes("networkB"))) {
      extra.push({
        field: "Cex",
        afterColumn: "profit",
        maxWidth: 120,
        extractFn: (row) => {
          return (row.networkA?.startsWith("CEX") || row.networkB?.startsWith("CEX")) ?? false;
        },
      });
    }
    if (tableName === "Iteration2" && res.columns.includes("selJson")) {
      const sel = (row: Record<string, any>) => {
        try {
          return JSON.parse(row.selJson);
        } catch {
          return undefined;
        }
      };
      extra.push({
        field: "TV",
        afterColumn: "tokenId",
        maxWidth: 140,
        extractFn: (row) => {
          const val = sel(row)?.tv;
          return val != null ? parseFloat(parseFloat(val).toFixed(4)) : null;
        },
      });
      extra.push({
        field: "profit",
        afterColumn: "TV",
        maxWidth: 140,
        cellStyle: (params: any) => {
          const val = parseFloat(params.value);
          if (!isNaN(val) && val > 0) return { backgroundColor: "rgba(34, 197, 94, 0.07)" };
          return null;
        },
        extractFn: (row) => {
          const val = sel(row)?.p;
          return val != null ? parseFloat(parseFloat(val).toFixed(4)) : null;
        },
      });
    }
    if (tableName === "Iteration2") {
      extra.push({
        field: "green",
        afterColumn: "greenNetwork",
        maxWidth: 140,
        extractFn: (row) =>
          row.greenNetwork === "a" ? row.networkA : row.greenNetwork === "b" ? row.networkB : null,
      });
      extra.push({
        field: "Cex",
        afterColumn: "profit",
        maxWidth: 120,
        // Derived, never stored: a CEX leg is a network starting with "CEX".
        extractFn: (row) =>
          (row.networkA?.startsWith("CEX") || row.networkB?.startsWith("CEX")) ?? false,
      });
      extra.push({
        field: "manual",
        afterColumn: "Cex",
        maxWidth: 120,
        extractFn: (row) => (row.isManual != null ? !!row.isManual : null),
      });
      extra.push({
        field: "sent",
        afterColumn: "manual",
        maxWidth: 110,
        cellStyle: (params: any) =>
          params.value ? { backgroundColor: "rgba(34, 197, 94, 0.07)" } : null,
        extractFn: (row) => {
          try {
            return JSON.parse(row.gatesJson)?.sent != null;
          } catch {
            return false;
          }
        },
      });
    }
    if (tableName === "IterationGroup") {
      extra.push({
        field: "pairs",
        afterColumn: "tokenId",
        maxWidth: 110,
        extractFn: (row) => {
          try {
            return JSON.parse(row.pairsJson)?.length ?? null;
          } catch {
            return null;
          }
        },
      });
      if (res.columns.includes("isManual")) {
        extra.push({
          field: "manual",
          afterColumn: "pairs",
          maxWidth: 120,
          extractFn: (row) => !!row.isManual,
        });
      }
    }
    if (tableName === "Event" && res.columns.includes("groupIdsJsonList")) {
      extra.push({
        field: "groups",
        afterColumn: "dependantTokensJsonList",
        maxWidth: 110,
        extractFn: (row) => {
          try {
            return JSON.parse(row.groupIdsJsonList)?.length ?? null;
          } catch {
            return null;
          }
        },
      });
    }
    if (tableName === "Event" && res.columns.includes("receiveTimeW") && res.columns.includes("receiveTime")) {
      const afterColumn = res.columns.includes("emittedTime")
        ? "emittedTime"
        : res.columns.includes("processedTime")
        ? "processedTime"
        : "receiveTimeW";
      extra.push({
        field: "receiveDelta",
        afterColumn,
        maxWidth: 140,
        extractFn: (row) => {
          const w = row.receiveTimeW;
          const r = row.receiveTime;
          if (w == null || r == null) return null;
          const delta = Number(w) - Number(r);
          return isNaN(delta) ? null : delta;
        },
      });
    }
    return extra;
  }, [tableName, res.columns]);

  const columnReorders: Record<string, { field: string; afterColumn: string }[]> = {
    Iteration: [
      { field: "greenNetwork", afterColumn: "networkB" },
      { field: "totalTime", afterColumn: "Cex" },
      { field: "disallowAutomationReason", afterColumn: "totalTime" },
      { field: "tokenPriceA", afterColumn: "disallowAutomationReason" },
      { field: "tokenPriceB", afterColumn: "tokenPriceA" },
      { field: "eventPercentFromSelectedTv", afterColumn: "tokenPriceB" },
    ],
    Iteration2: [
      // event before group — the event is the cause, the group its consequence
      { field: "eventId", afterColumn: "id" },
      { field: "groupId", afterColumn: "eventId" },
      { field: "networkA", afterColumn: "profit" },
      { field: "networkB", afterColumn: "networkA" },
      { field: "greenNetwork", afterColumn: "networkB" },
      // keep the decoded full-name column next to the a/b side code
      { field: "green", afterColumn: "greenNetwork" },
      { field: "totalTime", afterColumn: "sent" },
      { field: "terminationReason", afterColumn: "totalTime" },
      { field: "tokenPriceA", afterColumn: "terminationReason" },
      { field: "tokenPriceB", afterColumn: "tokenPriceA" },
    ],
    IterationGroup: [
      { field: "totalTime", afterColumn: "rounds" },
      { field: "terminationReason", afterColumn: "totalTime" },
    ],
  };

  // Old Iteration stores the green network's full name; Iteration2 stores the
  // side code ("a"/"b").
  const networkCellStyle = (field: string) => (params: any) => {
    const greenNetwork = params.data?.greenNetwork;
    if (!greenNetwork) return null;
    const isGreen =
      params.value === greenNetwork ||
      (greenNetwork === "a" && field === "networkA") ||
      (greenNetwork === "b" && field === "networkB");
    if (isGreen) return { backgroundColor: "rgba(34, 197, 94, 0.07)" };
    return { backgroundColor: "rgba(239, 68, 68, 0.07)" };
  };

  const columnDefs = useMemo(() => {
    const cols: Record<string, any>[] = [];
    if (res.columns.includes("id")) {
      cols.push({
        headerName: "★",
        field: "_pinned",
        width: 50,
        maxWidth: 50,
        resizable: false,
        filter: false,
        sortable: false,
        suppressMenu: true,
        suppressHeaderMenuButton: true,
        cellClass: "pin-cell",
        cellRenderer: (params: any) => {
          const id = params.data?.id;
          if (!id) return null;
          const isPinned = pinnedIds.has(`${tableName}-${id}`);
          return (
            <span
              className={`pin-star${isPinned ? " pinned" : ""}`}
              style={{
                cursor: "pointer",
                fontSize: "16px",
                color: isPinned ? "#f97316" : undefined,
                transition: "color 0.15s",
              }}
            >
              {isPinned ? "★" : "☆"}
            </span>
          );
        },
      });
    }
    for (const column of res.columns) {
      const colDef: Record<string, any> = { field: column };
      if (["Iteration", "Iteration2"].includes(tableName) && (column === "networkA" || column === "networkB")) {
        colDef.cellStyle = networkCellStyle(column);
      }
      if (["id", "eventId", "networkA", "networkB", "greenNetwork", "totalTime"].includes(column)) {
        colDef.maxWidth = 140;
      }
      cols.push(colDef);
    }
    const appendCols: Record<string, any>[] = [];
    // Insert extra (derived) columns
    for (const col of extraColumns) {
      const colDef: Record<string, any> = { field: col.field };
      if (col.maxWidth) colDef.maxWidth = col.maxWidth;
      if (col.cellStyle) colDef.cellStyle = col.cellStyle;
      if (col.afterColumn) {
        const idx = cols.findIndex((c) => c.field === col.afterColumn);
        if (idx !== -1) {
          cols.splice(idx + 1, 0, colDef);
          continue;
        }
      }
      appendCols.push(colDef);
    }
    const result = [...cols, ...appendCols];
    // Reorder existing columns
    const reorders = columnReorders[tableName] || [];
    for (const { field, afterColumn } of reorders) {
      const fromIdx = result.findIndex((c) => c.field === field);
      if (fromIdx === -1) continue;
      const [removed] = result.splice(fromIdx, 1);
      const toIdx = result.findIndex((c) => c.field === afterColumn);
      if (toIdx !== -1) {
        result.splice(toIdx + 1, 0, removed);
      } else {
        result.push(removed);
      }
    }
    return result;
  }, [res.columns, extraColumns, pinnedIds]);
  const rowsData = useMemo(() => {
    let rowsData = [];
    for (const values of res.values) {
      const rowData = bringColumnsValuesToItem(res.columns, values);
      for (const col of extraColumns) {
        rowData[col.field] = col.extractFn(rowData);
      }
      rowsData.push(rowData);
    }
    return rowsData;
  }, [res, extraColumns]);

  const [selectedItems, setSelectedItems] = useState<{ table: string; item: Record<string, any> }[]>([]);

  // Handle opening pinned entry from sidebar (works across tables)
  const pinnedEntryToOpen = useSqliteStore((state) => state.pinnedEntryToOpen);
  useEffect(() => {
    if (!pinnedEntryToOpen || !db) return;
    const { table, entryId } = pinnedEntryToOpen;
    try {
      const res = db.exec(`SELECT * FROM ${table} WHERE id = "${entryId}"`)[0];
      if (res?.values?.[0]) {
        const item = bringColumnsValuesToItem(res.columns, res.values[0]);
        setSelectedItems([{ table, item }]);
      } else {
        toast(`Pinned ${table} “${entryId}” isn’t in this file`, "warn");
      }
    } catch (e) {
      toast(`Can’t open pinned ${table}: no ${table} table in this file`, "error");
      console.error("Failed to open pinned entry", e);
    }
    useSqliteStore.setState({ pinnedEntryToOpen: null });
  }, [pinnedEntryToOpen, db]);

  const popSelectedItem = () => {
    const before = selectedItems.length;
    const newSelectedItems = selectedItems.slice(0, selectedItems.length - 1);
    setSelectedItems(newSelectedItems);
    console.log("Popping selected, was", before);
  };

  const pushSelectedItem = (item: (typeof selectedItems)[0]) => {
    const before = selectedItems.length;
    const newSelectedItems = [...selectedItems, item];
    setSelectedItems(newSelectedItems);
    console.log("Pushing selected, was", before);
  };

  // Open a row of any table in the detail dialog. Surfaces a visible toast
  // when the target is absent (dangling link across a rotated file) or its
  // table doesn't exist (older-worker file) instead of failing silently.
  const openEntry = (table: string, id: string) => {
    try {
      const res = db.exec(`SELECT * FROM ${table} WHERE id = "${id}"`)[0];
      if (!res?.values?.[0]) {
        toast(`No ${table} “${id}” in this file`, "warn");
        return;
      }
      pushSelectedItem({ table, item: bringColumnsValuesToItem(res.columns, res.values[0]) });
    } catch (e) {
      toast(`Can’t open ${table} “${id}”: no ${table} table in this file`, "error");
      console.error(`Failed to open ${table} entry`, id, e);
    }
  };

  const itemToDisplay = selectedItems.length > 0 ? selectedItems[selectedItems.length - 1] : null;

  const getElement = (value: any, valueType: ValueType | null, rootCtx: Record<string, any>, key?: string) => {
    // typeof null === "object" — keep nulls away from Object.entries
    if (value === null || value === undefined) return `${value}`;
    if (Array.isArray(value)) return getArrayElement(value, valueType, rootCtx);
    if (typeof value === "object") return getObjectElement(value, null, rootCtx, key);
    if (valueType === null) return `${value}`;
    return renderValueWithType(value, valueType, rootCtx, key);
  };

  const getArrayElement = (values: any[], valueType: ValueType | null, rootCtx: Record<string, any>) => {
    return (
      <div className="flex flex-col gap-1">
        <div>Array of {values.length}:</div>
        <div className="flex flex-row gap-1 flex-wrap">
          {values.map((value, i) => {
            if (typeof value === "string" || typeof value === "number") {
              return (
                <React.Fragment key={i}>
                  {renderValueWithType(value, valueType || ValueType.Unknown, rootCtx)}
                </React.Fragment>
              );
            }
            return (
              <Badge key={i} variant={"secondary"}>
                {getElement(value, valueType, rootCtx)}
              </Badge>
            );
          })}
        </div>
      </div>
    );
  };

  const getObjectElement = (
    data: Record<string, any>,
    valueType: ValueType | null,
    rootCtx: Record<string, any>,
    key?: string
  ) => {
    return (
      <Table>
        <TableBody>
          {Object.entries(data).map(([key, value]) => {
            const thisValueType = valueType === null ? getValueType(key) : valueType;
            return (
              <TableRow key={key}>
                <TableCell className="text-nowrap font-medium">{key}</TableCell>
                <TableCell className="break-all">{getElement(value, thisValueType, rootCtx, key)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const getValueType = (key: string) => {
    if (["iterationIdsJsonList", "solana_ex_iteration_ids_json_list", "extendedRangeFromIterId"].includes(key)) return ValueType.Iteration;
    if (["eventId"].includes(key)) return ValueType.Event;
    if (["groupIdsJsonList", "groupId"].includes(key)) return ValueType.IterationGroup;

    if (["address", "poolAddress", "pool_address"].includes(key)) return ValueType._Address;
    if (["txHash", "tx_hash"].includes(key)) return ValueType._TxHash;
    if (["blockNumber", "blockA", "blockB", "blocksA", "blocksB"].includes(key)) return ValueType._BlockNumber;
    if (["receiveTime", "receiveTimeW", "receive_time", "receivedAt", "processedTime", "emittedTime", "sentAtMs", "atMs", "started"].includes(key)) return ValueType._Timestemp;

    return ValueType.Unknown;
  };

  const renderValueWithType = (value: any, type: ValueType, rootCtx: Record<string, any>, key?: string) => {
    if (["routeId", "sellRouteId"].includes(key || "")) {
      value = `${value}`.replace("rev_", "");
    }

    if (type === ValueType._Timestemp) {
      // keep the readable UTC string but expose milliseconds (…:01.808 GMT)
      const d = new Date(value);
      const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
      const withMs = isNaN(d.getTime()) ? `${value}` : d.toUTCString().replace(" GMT", `.${ms} GMT`);
      return (
        <Badge variant={"outline"}>
          {withMs} | {value}
        </Badge>
      );
    }

    if (type === ValueType.Unknown) {
      let valueAdj = key === "terminationReason" ? decodeTerminationReason(value) : value;
      return <Badge variant={"outline"}>{valueAdj}</Badge>;
    }

    if ([ValueType.Event, ValueType.Iteration, ValueType.Iteration2, ValueType.IterationGroup].includes(type)) {
      return (
        <Badge
          variant={"outline"}
          className="cursor-pointer bg-blue-300/10 hover:bg-blue-500/30"
          onClick={() => openEntry(type, `${value}`)}
        >
          {value}
        </Badge>
      );
    }

    if ([ValueType._Address, ValueType._TxHash, ValueType._BlockNumber].includes(type)) {
      let network = rootCtx.network;
      if (!network && key?.endsWith("A")) {
        network = rootCtx[`networkA`];
      }
      if (!network && key?.endsWith("B")) {
        network = rootCtx[`networkB`];
      }
      if (network) {
        // Value may include ","
        let values = typeof value === "string" ? value.split(",") : [value];
        return (
          <div className="flex gap-1">
            {values.map((value, i) => {
              const explorerUrl = getExplorerUrl(network);
              const fullUrl = buildExplorerFullUrl(explorerUrl, type, value);
              return (
                <a key={i} href={fullUrl} target="_blank">
                  <Badge variant={"outline"} className="cursor-pointer bg-green-300/10 hover:bg-green-500/30">
                    {value}
                  </Badge>
                </a>
              );
            })}
          </div>
        );
      }
      return (
        <Badge variant={"outline"} className="bg-gray-300/20">
          {value}
        </Badge>
      );
    }

    return <Badge variant={"outline"}>{value}</Badge>;
  };

  const getTableItemElement = (table: string, key: string, value: any, rootCtx: Record<string, any>) => {
    const valueType = getValueType(key);
    try {
      // iteration2-era tables get decoded/custom views; undefined falls
      // through to the generic rendering below.
      const custom = renderIter2Value({ table, key, value, rootCtx, db, openEntry, getElement });
      if (custom !== undefined) return custom;
      if (
        [
          "intermediateResultsJson",
          "tvResultsJsonList",
          "buy_res_json_list",
          "extremumResJson",
          "extremumResFullJson",
          "extremumTvResJson",
          "buyTxJson",
          "routesABuyIdsJsonList",
          "routesBBuyIdsJsonList",
          "routesSellIdsJsonList",
        ].includes(key)
      ) {
        let plotTop = <></>;
        let plotBtm = <></>;
        if (key === "extremumResJson") {
          plotTop = <Plot rootCtx={rootCtx} extrKey="extremumResJson" />;
        }
        if (key === "extremumResFullJson") {
          plotBtm = <Plot rootCtx={rootCtx} extrKey="extremumResFullJson" />;
        }
        return (
          <>
            {plotTop}
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-yellow-600 py-1">{`Toggle ${key}`}</AccordionTrigger>
                <AccordionContent>
                  <>
                    {plotBtm}
                    {getElement(JSON.parse(value), valueType, rootCtx, key)}
                  </>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        );
      }
      if (key.endsWith("JsonList") || key.endsWith("json_list")) {
        return getElement(JSON.parse(value), valueType, rootCtx);
      }
      if (key.endsWith("Json") || key.endsWith("json")) {
        return getElement(JSON.parse(value), valueType, rootCtx, key);
      }

      if (value === null) return "";
      const stringValue = `${value}`;
      if (stringValue.length === 0) return ``;
      return renderValueWithType(value, valueType, rootCtx, key);
    } catch (e) {
      console.debug("getTableItemElement fell back to raw value for", key, e);
      return value;
    }
  };

  return (
    <SQLiteLayout>
      <div className="ag-theme-quartz min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min">
        <Dialog open={selectedItems.length > 0}>
          <DialogContent
            className="max-h-[80vh] overflow-y-scroll w-3/4 max-w-5xl"
            onInteractOutside={() => popSelectedItem()}
            onEscapeKeyDown={() => popSelectedItem()}
          >
            <DialogHeader>
              <DialogTitle className="mb-2 flex items-center gap-2">
                {itemToDisplay?.item?.id && (() => {
                  const isPinned = pinnedIds.has(`${itemToDisplay.table}-${itemToDisplay.item.id}`);
                  return (
                    <Star
                      className={`h-5 w-5 cursor-pointer transition-colors duration-150 dialog-pin-star ${isPinned ? "pinned" : ""}`}
                      fill={isPinned ? "currentColor" : "none"}
                      onClick={() => togglePin(itemToDisplay.table, `${itemToDisplay.item.id}`)}
                    />
                  );
                })()}
                Viewing {itemToDisplay?.table} entry
              </DialogTitle>
              <Table className="w-full">
                <TableCaption>End of {itemToDisplay?.table} entry</TableCaption>
                <TableBody>
                  {itemToDisplay &&
                    orderedEntries(itemToDisplay.item).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{key}</TableCell>
                        <TableCell className="break-all">
                          {getTableItemElement(itemToDisplay.table, key, value, itemToDisplay.item)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <AgGridReact
          columnDefs={columnDefs}
          rowData={rowsData}
          pagination={true}
          defaultColDef={{
            filter: true,
            enableRowGroup: true,
          }}
          autoSizeStrategy={{
            type: "fitCellContents",
          }}
          rowGroupPanelShow={"always"}
          alwaysShowHorizontalScroll={true}
          paginationAutoPageSize={true}
          rowClass="cursor-pointer"
          onCellClicked={(e) => {
            if (e.column.getColId() === "_pinned") {
              const id = e.data?.id;
              if (id) togglePin(tableName, `${id}`);
              return;
            }
            if (e.data) {
              pushSelectedItem({
                table: tableName,
                item: e.data,
              });
            }
          }}
        />
      </div>
    </SQLiteLayout>
  );
}
