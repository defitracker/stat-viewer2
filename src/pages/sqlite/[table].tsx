import { useSqliteStore } from "@/util/sqliteStore";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { AgGridReact } from "ag-grid-react";
import SQLiteLayout from "./_layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

enum ValueType {
  Token = "Token",
  Route = "Route",
  Network = "Network",
  Event = "Event",
  Unknown = "Unknown",
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

  const res = db.exec(`SELECT * FROM ${tableName};`)[0];

  const columnDefs = res.columns.map((column) => ({
    field: column,
  }));
  let rowsData = [];
  for (const values of res.values) {
    const rowData = bringColumnsValuesToItem(res.columns, values);
    rowsData.push(rowData);
  }

  const [selectedItems, setSelectedItems] = useState<{ table: string; item: Record<string, any> }[]>([]);

  const popSelectedItem = () => {
    const newSelectedItems = selectedItems.slice(0, selectedItems.length - 1);
    setSelectedItems(newSelectedItems);
  };

  const pushSelectedItem = (item: (typeof selectedItems)[0]) => {
    const newSelectedItems = [...selectedItems, item];
    setSelectedItems(newSelectedItems);
  };

  const itemToDisplay = selectedItems.length > 0 ? selectedItems[selectedItems.length - 1] : null;

  const getElement = (value: any, valueType: ValueType) => {
    if (Array.isArray(value)) return getArrayElement(value, valueType);
    if (typeof value === "object") return getObjectElement(value, valueType);
    return `${value}`;
  };

  const getArrayElement = (values: any[], valueType: ValueType) => {
    return (
      <div className="flex flex-col gap-1">
        <div>Array of {values.length}:</div>
        <div className="flex flex-row gap-1 flex-wrap">
          {values.map((value) => {
            if (typeof value === "string" || typeof value === "number") {
              return renderValueWithType(value, valueType);
            }
            return <Badge variant={"secondary"}>{getElement(value, valueType)}</Badge>;
          })}
        </div>
      </div>
    );
  };

  const getObjectElement = (data: Record<string, any>, valueType: ValueType) => {
    return (
      <Table>
        <TableBody>
          {Object.entries(data).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="text-nowrap font-medium">{key}</TableCell>
              <TableCell className="break-all">{getElement(value, valueType)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const getValueType = (key: string) => {
    if (["eventId"].includes(key)) return ValueType.Event;
    if (["tokenId"].includes(key)) return ValueType.Token;
    if (["routesAIdsJsonList", "routesBIdsJsonList", "dependantRoutesIdsJsonList"].includes(key))
      return ValueType.Route;
    if (["networkId", "greenNetwork", "redNetwork", "networkA", "networkB"].includes(key)) return ValueType.Network;
    return ValueType.Unknown;
  };

  const renderValueWithType = (value: any, type: ValueType) => {
    if (type === ValueType.Unknown) return <Badge variant={"outline"}>{value}</Badge>;

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
  };

  const getTableItemElement = (key: string, value: any) => {
    const valueType = getValueType(key);
    try {
      if (key.endsWith("JsonList")) {
        return getElement(JSON.parse(value), valueType);
      }
      if (key.endsWith("Json")) {
        return getElement(JSON.parse(value), valueType);
      }

      if (value === null) return "";
      const stringValue = `${value}`;
      if (stringValue.length === 0) return ``;
      return renderValueWithType(value, valueType);
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
                        <TableCell className="break-all">{getTableItemElement(key, value)}</TableCell>
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
