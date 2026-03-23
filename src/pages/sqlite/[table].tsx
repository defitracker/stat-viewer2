import { useSqliteStore } from "@/util/sqliteStore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { AgGridReact } from "ag-grid-react";
import SQLiteLayout from "./_layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { decodeTerminationReason, getExplorerUrl } from "@/util/helper";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import BigNumber from "bignumber.js";
import { Star } from "lucide-react";
import * as idb from "@/util/idb";

import functionPlot, { FunctionPlotOptions } from "function-plot";
export interface FunctionPlotProps {
  options?: FunctionPlotOptions;
}
export const FunctionPlot: React.FC<FunctionPlotProps> = React.memo(
  ({ options }) => {
    const rootEl = useRef(null);

    useEffect(() => {
      try {
        functionPlot(Object.assign({}, options, { target: rootEl.current }));
      } catch (e) {}
    });

    return <div ref={rootEl} />;
  },
  () => false
);

enum ValueType {
  Event = "Event",
  Iteration = "Iteration",

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
  const res: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i];
    const value = values[i];
    res[columnName] = value;
  }
  return res;
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

  let domain_x1 = tvPoints.reduce((acc, cur) => (cur[0] < acc ? cur[0] : acc), 0);
  let domain_x2 = tvPoints.reduce((acc, cur) => (cur[0] > acc ? cur[0] : acc), 0);
  let domain_y1 = tvPoints.reduce((acc, cur) => (cur[1] < acc ? cur[1] : acc), 0);
  let domain_y2 = tvPoints.reduce((acc, cur) => (cur[1] > acc ? cur[1] : acc), 0);

  if (estimatedProfit.toNumber() > domain_y2) {
    domain_y2 = estimatedProfit.toNumber();
  }

  const data: FunctionPlotOptions["data"] = [];
  data.push({ fn });
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
    return extra;
  }, [tableName, res.columns]);

  const columnReorders: Record<string, { field: string; afterColumn: string }[]> = {
    Iteration: [
      { field: "greenNetwork", afterColumn: "networkB" },
      { field: "totalTime", afterColumn: "Cex" },
      { field: "disallowAutomationReason", afterColumn: "totalTime" },
    ],
  };

  const networkCellStyle = (_field: string) => (params: any) => {
    const greenNetwork = params.data?.greenNetwork;
    if (!greenNetwork) return null;
    if (params.value === greenNetwork) return { backgroundColor: "rgba(34, 197, 94, 0.07)" };
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
      if (tableName === "Iteration" && (column === "networkA" || column === "networkB")) {
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
    try {
      const res = db.exec(`SELECT * FROM ${pinnedEntryToOpen.table} WHERE id = "${pinnedEntryToOpen.entryId}"`)[0];
      if (res) {
        const item = bringColumnsValuesToItem(res.columns, res.values[0]);
        setSelectedItems([{ table: pinnedEntryToOpen.table, item }]);
      }
    } catch (e) {
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

  const itemToDisplay = selectedItems.length > 0 ? selectedItems[selectedItems.length - 1] : null;

  const getElement = (value: any, valueType: ValueType | null, rootCtx: Record<string, any>, key?: string) => {
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
    if (["iterationIdsJsonList", "solana_ex_iteration_ids_json_list"].includes(key)) return ValueType.Iteration;
    if (["eventId"].includes(key)) return ValueType.Event;

    if (["address", "poolAddress", "pool_address"].includes(key)) return ValueType._Address;
    if (["txHash", "tx_hash"].includes(key)) return ValueType._TxHash;
    if (["blockNumber", "blockA", "blockB"].includes(key)) return ValueType._BlockNumber;
    if (["receiveTime", "receiveTimeW", "receive_time"].includes(key)) return ValueType._Timestemp;

    return ValueType.Unknown;
  };

  const renderValueWithType = (value: any, type: ValueType, rootCtx: Record<string, any>, key?: string) => {
    if (["routeId", "sellRouteId"].includes(key || "")) {
      value = `${value}`.replace("rev_", "");
    }

    if (type === ValueType._Timestemp) {
      return (
        <Badge variant={"outline"}>
          {new Date(value).toUTCString()} | {value}
        </Badge>
      );
    }

    if (type === ValueType.Unknown) {
      let valueAdj = key === "terminationReason" ? decodeTerminationReason(value) : value;
      return <Badge variant={"outline"}>{valueAdj}</Badge>;
    }

    if ([ValueType.Event, ValueType.Iteration].includes(type)) {
      return (
        <Badge
          variant={"outline"}
          className="cursor-pointer bg-blue-300/10 hover:bg-blue-500/30"
          onClick={() => {
            const tableToFetch = type;
            const res = db.exec(`SELECT * FROM ${tableToFetch} WHERE id = "${value}"`)[0];
            const item = bringColumnsValuesToItem(res.columns, res.values[0]);
            pushSelectedItem({
              table: tableToFetch,
              item: item,
            });
          }}
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
            {values.map((value) => {
              const explorerUrl = getExplorerUrl(network);
              const fullUrl = buildExplorerFullUrl(explorerUrl, type, value);
              return (
                <a href={fullUrl} target="_blank">
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

  const getTableItemElement = (key: string, value: any, rootCtx: Record<string, any>) => {
    const valueType = getValueType(key);
    try {
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
                    Object.entries(itemToDisplay.item).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{key}</TableCell>
                        <TableCell className="break-all">
                          {getTableItemElement(key, value, itemToDisplay.item)}
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
