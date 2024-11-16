import { useSqliteStore } from "@/util/sqliteStore";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { AgGridReact } from "ag-grid-react";
import SQLiteLayout from "./_layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getExplorerUrl } from "@/util/helper";

enum ValueType {
  Token = "Token",
  Route = "Route",
  PairData = "PairData",
  Network = "Network",
  Event = "Event",
  Iteration = "Iteration",

  _Address = "_Address",
  _TxHash = "_TxHash",
  _BlockNumber = "_BlockNumber",

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

  const columnDefs = res.columns.map((column) => ({
    field: column,
  }));
  const rowsData = useMemo(() => {
    let rowsData = [];
    for (const values of res.values) {
      const rowData = bringColumnsValuesToItem(res.columns, values);
      rowsData.push(rowData);
    }
    return rowsData;
  }, [res]);

  const [selectedItems, setSelectedItems] = useState<{ table: string; item: Record<string, any> }[]>([]);

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

  const getElement = (value: any, valueType: ValueType, rootCtx: Record<string, any>) => {
    if (Array.isArray(value)) return getArrayElement(value, valueType, rootCtx);
    if (typeof value === "object") return getObjectElement(value, valueType, rootCtx);
    return `${value}`;
  };

  const getArrayElement = (values: any[], valueType: ValueType, rootCtx: Record<string, any>) => {
    return (
      <div className="flex flex-col gap-1">
        <div>Array of {values.length}:</div>
        <div className="flex flex-row gap-1 flex-wrap">
          {values.map((value, i) => {
            if (typeof value === "string" || typeof value === "number") {
              return <React.Fragment key={i}>{renderValueWithType(value, valueType, rootCtx)}</React.Fragment>;
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

  const getObjectElement = (data: Record<string, any>, valueType: ValueType, rootCtx: Record<string, any>) => {
    return (
      <Table>
        <TableBody>
          {Object.entries(data).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="text-nowrap font-medium">{key}</TableCell>
              <TableCell className="break-all">{getElement(value, valueType, rootCtx)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const getValueType = (key: string) => {
    if (["iterationIdsJsonList"].includes(key)) return ValueType.Iteration;
    if (["eventId"].includes(key)) return ValueType.Event;
    if (["routePairsIdsJsonList"].includes(key)) return ValueType.PairData;
    if (["tokenId", "token1id", "token2id"].includes(key)) return ValueType.Token;
    if (["routesAIdsJsonList", "routesBIdsJsonList", "dependantRoutesIdsJsonList"].includes(key))
      return ValueType.Route;
    if (["networkId", "greenNetwork", "redNetwork", "networkA", "networkB"].includes(key)) return ValueType.Network;

    if (["address", "poolAddress"].includes(key)) return ValueType._Address;
    if (["txHash"].includes(key)) return ValueType._TxHash;
    if (["blockNumber"].includes(key)) return ValueType._BlockNumber;

    return ValueType.Unknown;
  };

  const renderValueWithType = (value: any, type: ValueType, rootCtx: Record<string, any>, key?: string) => {
    if (key === "receiveTime") {
      return (
        <Badge variant={"outline"}>
          {new Date(value).toUTCString()} | {value}
        </Badge>
      );
    }

    if (type === ValueType.Unknown) {
      return <Badge variant={"outline"}>{value}</Badge>;
    }

    if (
      [
        ValueType.Token,
        ValueType.Route,
        ValueType.Network,
        ValueType.Event,
        ValueType.PairData,
        ValueType.Iteration,
      ].includes(type)
    ) {
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
      const network = rootCtx.networkId;
      if (network) {
        const explorerUrl = getExplorerUrl(network);
        const fullUrl = buildExplorerFullUrl(explorerUrl, type, value);
        return (
          <a href={fullUrl} target="_blank">
            <Badge variant={"outline"} className="cursor-pointer bg-green-300/10 hover:bg-green-500/30">
              {value}
            </Badge>
          </a>
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
      if (key.endsWith("JsonList")) {
        return getElement(JSON.parse(value), valueType, rootCtx);
      }
      if (key.endsWith("Json")) {
        return getElement(JSON.parse(value), valueType, rootCtx);
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
              <DialogTitle className="mb-2">Viewing {itemToDisplay?.table} entry</DialogTitle>
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
          rowGroupPanelShow={"always"}
          alwaysShowHorizontalScroll={true}
          paginationAutoPageSize={true}
          rowClass="cursor-pointer"
          onRowClicked={(e) => {
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
