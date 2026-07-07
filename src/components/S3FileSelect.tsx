import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { CellClickedEvent, ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { Input } from "@/components/ui/input";
import { S3Connect, S3Manager } from "@/util/S3Manager";
import S3 from "aws-sdk/clients/s3";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { useSqliteStore } from "@/util/sqliteStore";
import { useS3CredentialsStore } from "@/util/s3CredentialsStore";
import { readDbTables, readSqlFile } from "@/util/helper";
import * as idb from "@/util/idb";
import {
  clearDirHandle,
  ensureDirPermission,
  loadDirHandle,
  saveDirHandle,
  supportsDirPicker,
} from "@/util/downloadDir";
import { zipSync } from "fflate";
import { useNavigate } from "react-router-dom";

const formSchema = z.object({
  region: z.string().min(1, { message: "region is required" }),
  bucketName: z.string().min(1, { message: "bucketName is required" }),
  accessKeyId: z
    .string()
    .length(20, { message: "AccessKeyId must be 20 characters." }),
  secretAccessKey: z
    .string()
    .length(40, { message: "SecretAccessKey must be 40 characters." }),
});

function getFileSizeString(size: number | undefined) {
  if (size === undefined) return "unknown size";
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function S3FileSelectWrapped({
  loading,
  setLoading,
  files,
  setFiles,
}: {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  files: null | S3.ObjectList;
  setFiles: React.Dispatch<React.SetStateAction<null | S3.ObjectList>>;
}) {
  const {
    credentials,
    autoConnect,
    rememberCreds,
    saveCredentials,
    clearCredentials,
    setAutoConnect,
    setRememberCreds,
  } = useS3CredentialsStore();
  const autoConnectAttempted = useRef(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      region: "us-east-1",
      bucketName: "workerresolved",
      accessKeyId: "",
      secretAccessKey: "",
    },
  });

  const navigate = useNavigate();

  const s3 = useRef<S3Manager | undefined>(undefined);

  // filename -> download progress 0..1
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const [dirHandle, setDirHandle] = useState<any>(undefined);
  const [selected, setSelected] = useState<{ filename: string; filesize: number }[]>([]);
  // In-flight guard lives in a ref: state snapshots in render closures go stale.
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    loadDirHandle().then((h) => h && setDirHandle(h));
  }, []);

  function saveBlobViaAnchor(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Shared streaming core: fetch the object as a stream, feed chunks to the sink,
  // publish per-file progress. Returns false on failure or if already in flight.
  async function streamFetch(
    filename: string,
    expectedSize: number,
    onChunk: (c: Uint8Array) => Promise<void> | void
  ): Promise<boolean> {
    const manager = S3Connect.getManager();
    if (!manager) {
      console.error("No s3 manager");
      return false;
    }
    if (inFlight.current.has(filename)) return false;
    inFlight.current.add(filename);
    setDownloads((d) => ({ ...d, [filename]: 0 }));
    try {
      const resp = await fetch(manager.getSignedUrl(filename));
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const total = Number(resp.headers.get("content-length")) || expectedSize || 0;
      const reader = resp.body.getReader();
      let loaded = 0;
      let lastUi = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await onChunk(value);
        loaded += value.length;
        const now = Date.now();
        if (now - lastUi > 150) {
          lastUi = now;
          const p = total ? Math.min(loaded / total, 0.999) : 0;
          setDownloads((d) => ({ ...d, [filename]: p }));
        }
      }
      return true;
    } catch (e) {
      console.error("Download failed", filename, e);
      return false;
    } finally {
      inFlight.current.delete(filename);
      setDownloads((d) => {
        const { [filename]: _done, ...rest } = d;
        return rest;
      });
    }
  }

  async function downloadFile(filename: string, expectedSize: number) {
    const shortName = filename.split("/").pop() || filename;
    if (dirHandle && (await ensureDirPermission(dirHandle))) {
      const fh = await dirHandle.getFileHandle(shortName, { create: true });
      const writable = await fh.createWritable();
      await streamFetch(filename, expectedSize, (c) => writable.write(c));
      await writable.close();
    } else {
      const chunks: Uint8Array[] = [];
      const ok = await streamFetch(filename, expectedSize, (c) => {
        chunks.push(c);
      });
      if (ok) {
        saveBlobViaAnchor(
          shortName,
          new Blob(chunks as BlobPart[], { type: "application/octet-stream" })
        );
      }
    }
  }

  // Multi-select download: with a folder set — stream each file in (no dialogs);
  // without — fetch all in parallel and save ONE zip (store, no compression) so the
  // browser shows a single save prompt.
  async function downloadSelected() {
    const files = selected.filter((f) => !inFlight.current.has(f.filename));
    if (!files.length) return;
    if (dirHandle && (await ensureDirPermission(dirHandle))) {
      // limited concurrency; folder permission already granted in this gesture
      const queue = [...files];
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          for (;;) {
            const f = queue.shift();
            if (!f) return;
            const shortName = f.filename.split("/").pop() || f.filename;
            const fh = await dirHandle.getFileHandle(shortName, { create: true });
            const writable = await fh.createWritable();
            await streamFetch(f.filename, f.filesize, (c) => writable.write(c));
            await writable.close();
          }
        })
      );
    } else {
      const results = await Promise.all(
        files.map(async (f) => {
          const chunks: Uint8Array[] = [];
          const ok = await streamFetch(f.filename, f.filesize, (c) => {
            chunks.push(c);
          });
          if (!ok) return null;
          const total = chunks.reduce((a, c) => a + c.length, 0);
          const buf = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) {
            buf.set(c, o);
            o += c.length;
          }
          const shortName = f.filename.split("/").pop() || f.filename;
          return [shortName, buf] as const;
        })
      );
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const r of results) if (r) entries[r[0]] = [r[1], { level: 0 }];
      if (!Object.keys(entries).length) return;
      const zipped = zipSync(entries);
      saveBlobViaAnchor(
        `stat_files_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
        new Blob([zipped as BlobPart], { type: "application/zip" })
      );
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>, shouldSave = true) {
    const { region, bucketName, accessKeyId, secretAccessKey } = values;

    if (loading) return;
    setLoading(true);

    const maybeS3 = await S3Connect.connect({
      bucketName,
      region,
      accessKeyId,
      secretAccessKey,
    });

    if (maybeS3 instanceof S3Manager) {
      s3.current = maybeS3;
      const files = await s3.current.listObjects();
      setFiles(files);

      // Save credentials on successful connection if remember is checked
      if (shouldSave && rememberCreds) {
        saveCredentials({
          ...values,
          autoConnect,
        });
      }
    } else {
      const e = maybeS3;
      console.error("S3Connect returned error", e);
    }

    setLoading(false);
  }

  // Load stored credentials on mount and auto-connect if enabled
  useEffect(() => {
    if (credentials) {
      form.reset({
        region: credentials.region,
        bucketName: credentials.bucketName,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      });

      // Auto-connect if enabled (only once)
      if (autoConnect && !autoConnectAttempted.current) {
        autoConnectAttempted.current = true;
        // Small delay to ensure form is populated
        setTimeout(() => {
          onSubmit(credentials, false);
        }, 100);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderForm = () => {
    if (files !== null) return;
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => onSubmit(values, true))} className="">
          <CardContent className="grid gap-2">
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bucketName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bucket name</FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accessKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AccessKeyId</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="off" placeholder="******" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secretAccessKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SecretAccessKey</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="off" placeholder="************" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberCreds}
                  onChange={(e) => setRememberCreds(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Remember credentials
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={(e) => setAutoConnect(e.target.checked)}
                  disabled={!rememberCreds}
                  className="w-4 h-4 rounded border-gray-300 disabled:opacity-50"
                />
                Auto-connect
              </label>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button disabled={loading} className="flex-1" type="submit">
              Connect
            </Button>
            {credentials && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  clearCredentials();
                  form.reset({
                    region: "us-east-1",
                    bucketName: "workerresolved",
                    accessKeyId: "",
                    secretAccessKey: "",
                  });
                }}
              >
                Clear saved
              </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    );
  };

  const renderFiles = () => {
    if (files === null) return;

    type FileData = {
      filename: string;
      filesize: number;
      timeStarted: number;
      timeUploaded: number;
      download: 0;
      downloadProgress: number | undefined;
      remove: 0;
      remove2: 0;
    };

    const onCellClick = async (e: CellClickedEvent<FileData>) => {
      if (!e.data) return console.error("No e.data", e);

      const manager = S3Connect.getManager();
      if (!manager) return console.error("No s3 manager");

      setLoading(true);
      //   useMyStore.getState().setFileName(e.data.filename);

      const objectRes = await manager.getObject(e.data.filename);
      if (objectRes !== undefined) {
        const blob = new Blob([objectRes.body as ArrayBuffer], {
          type: objectRes.contentType,
        });
        const file = new File([blob], objectRes.filename, {
          type: objectRes.contentType,
        });
        const db = await readSqlFile(file);
        const tables = readDbTables(db);
        useSqliteStore.setState({ db, tables, filename: objectRes.filename });
        await idb.addFile(file);
        navigate(tables.length > 0 ? `/sqlite/${tables[0]}` : "/sqlite");
      }
      setLoading(false);
    };

    const rowData: FileData[] = files.map((f) => {
      let timeStarted = parseInt(
        f.Key?.replace(".sqlite", "").split("_")?.pop() ?? "0"
      );
      if (isNaN(timeStarted)) timeStarted = 0;
      return {
        filename: f.Key || "{unknown}",
        filesize: f.Size || 0,
        timeStarted: timeStarted,
        timeUploaded: f.LastModified?.getTime() ?? 0,
        download: 0,
        downloadProgress: downloads[f.Key || ""],
        remove: 0,
        remove2: 0,
      };
    });
    const colDefs: ColDef<FileData>[] = [
      {
        colId: "select",
        headerName: "",
        width: 48,
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        suppressHeaderFilterButton: true,
        onCellClicked: () => {},
      },
      {
        field: "filename",
        filter: true,
        sortable: false,
        flex: 1,
        onCellClicked: onCellClick,
      },
      {
        field: "timeStarted",
        flex: 1,
        valueFormatter: (v) => new Date(v.data?.timeStarted ?? 0).toUTCString(),
        onCellClicked: onCellClick,
      },
      {
        field: "timeUploaded",
        flex: 1,
        valueFormatter: (v) =>
          new Date(v.data?.timeUploaded ?? 0).toUTCString(),
        onCellClicked: onCellClick,
      },
      {
        field: "filesize",
        flex: 1,
        width: 150,
        valueFormatter: (v) => getFileSizeString(v.data?.filesize),
        onCellClicked: onCellClick,
      },
      {
        field: "download",
        headerName: "Download",
        width: 130,
        suppressHeaderMenuButton: true,
        suppressHeaderFilterButton: true,
        sortable: false,
        onCellClicked: () => {},
        cellRenderer: (params: any) => {
          const p: number | undefined = params.data.downloadProgress;
          if (p !== undefined) {
            return (
              <div className="w-full h-full flex items-center">
                <div className="w-full h-4 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${Math.round(p * 100)}%` }}
                  />
                  <span className="absolute inset-0 text-[10px] leading-4 text-center font-mono">
                    {Math.round(p * 100)}%
                  </span>
                </div>
              </div>
            );
          }
          return (
            <Button
              size={"sm"}
              variant={"outline"}
              onClick={(e) => {
                // no confirmation by design (fast UX)
                e.stopPropagation();
                downloadFile(params.data.filename, params.data.filesize);
              }}
            >
              Download
            </Button>
          );
        },
      },
      {
        field: "remove",
        headerName: "Delete",
        width: 100,
        suppressHeaderMenuButton: true,
        suppressHeaderFilterButton: true,
        sortable: false,
        onCellClicked: () => {},
        cellRenderer: (params: any) => (
          <Button
            size={"sm"}
            variant={"outline"}
            onClick={async (e) => {
              if (!e.metaKey) return;
              const filename = params.data.filename;

              const manager = S3Connect.getManager();
              if (!manager) return console.error("No s3 manager");

              setLoading(true);

              await manager.deleteObject(filename);

              setFiles(files.filter((f) => f.Key !== filename));

              setLoading(false);
            }}
          >
            Delete
          </Button>
        ),
      },
      {
        field: "remove2",
        headerName: "Delete BELOW",
        width: 160,
        suppressHeaderMenuButton: true,
        suppressHeaderFilterButton: true,
        sortable: false,
        onCellClicked: () => {},
        cellRenderer: (params: any) => (
          <Button
            size={"sm"}
            variant={"outline"}
            onClick={async (e) => {
              if (!e.metaKey) return;
              const thisFileTimeStarted = params.data.timeStarted as number;

              const manager = S3Connect.getManager();
              if (!manager) return console.error("No s3 manager");

              const getTimeStarted = (f: S3.Object) => {
                let timeStarted = parseInt(
                  f.Key?.replace(".sqlite", "").split("_")?.pop() ?? "0"
                );
                if (isNaN(timeStarted)) timeStarted = 0;
                return timeStarted;
              };

              setLoading(true);

              const filesToDelete = files
                .filter((f) => {
                  const timeStarted = getTimeStarted(f);
                  return timeStarted < thisFileTimeStarted;
                })
                .sort((a, b) => {
                  const ta = getTimeStarted(a);
                  const tb = getTimeStarted(b);
                  return tb - ta;
                });
              // .slice(0, 100);

              const filenamesToDelete = filesToDelete
                .map((f) => f.Key)
                .filter((f) => f !== undefined);

              for (const filenameToDelete of filenamesToDelete) {
                await manager.deleteObject(filenameToDelete);
              }

              if (s3.current) {
                const newFiles = await s3.current.listObjects();
                setFiles(newFiles);
              } else {
                const newFiles = files.filter(
                  (f) => !filenamesToDelete.includes(f.Key ?? "")
                );
                setFiles(newFiles);
              }

              setLoading(false);
            }}
          >
            Delete ALL below
          </Button>
        ),
      },
    ];

    // const gridRef = useRef<AgGridReact | null>(null);

    return (
      <div className="ag-theme-quartz min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min">
        <AgGridReact
          className={`${loading ? "animate-pulse" : ""}`}
          // ref={gridRef}
          // Stable row ids: without them every progress tick rebuilt all row DOM,
          // eating clicks on other rows' Download buttons.
          getRowId={(p) => p.data.filename}
          rowSelection="multiple"
          suppressRowClickSelection={true}
          onSelectionChanged={(e) =>
            setSelected(
              e.api
                .getSelectedRows()
                .map((r: any) => ({ filename: r.filename, filesize: r.filesize }))
            )
          }
          initialState={{
            sort: {
              sortModel: [{ colId: "timeUploaded", sort: "desc" }],
            },
          }}
          onFirstDataRendered={(e) => {
            // e.api.autoSizeAllColumns();
            for (let i = 0; i < 15; i += 3) {
              setTimeout(() => {
                // e.api.autoSizeAllColumns();
                e.api.sizeColumnsToFit();
              }, 100 * i);
            }
          }}
          rowData={rowData}
          columnDefs={colDefs}
          pagination={true}
          // suppressPaginationPanel={true}
          alwaysShowHorizontalScroll={true}
          multiSortKey={"ctrl"}
        />
      </div>
    );
  };

  const totalSize = files
    ?.map((f) => f.Size ?? 0)
    .reduce((acc, cur) => acc + cur, 0);

  return (
    <>
      <div className="w-full">
        <Card
          className={clsx(
            "w-full mx-auto transition-all duration-50 ease-in-out",
            {
              "max-w-sm": files === null,
              "max-w-full": files !== null,
            }
          )}
        >
          <CardHeader>
            <CardTitle className="text-xl">
              {files === null && "Connect to S3"}
              {files !== null && (
                <div className="flex justify-between items-center">
                  Select file from S3 ({getFileSizeString(totalSize)})
                  <div className="flex gap-2 items-center">
                    {selected.length > 0 && (
                      <Button
                        variant="default"
                        title={
                          dirHandle
                            ? `Streams ${selected.length} file(s) into "${dirHandle.name}" — no dialogs`
                            : `Downloads ${selected.length} file(s) and saves ONE zip — single save prompt`
                        }
                        onClick={() => downloadSelected()}
                      >
                        ⬇ Download selected ({selected.length})
                        {!dirHandle && " as zip"}
                      </Button>
                    )}
                    {supportsDirPicker() && (
                      <Button
                        variant="outline"
                        title={
                          dirHandle
                            ? `Downloads stream into "${dirHandle.name}" with no save dialog. Click to change, ⌘-click to clear.`
                            : "Pick a folder once — downloads then save there with no dialog at all"
                        }
                        onClick={async (e) => {
                          if (e.metaKey && dirHandle) {
                            await clearDirHandle();
                            setDirHandle(undefined);
                            return;
                          }
                          try {
                            const h = await (window as any).showDirectoryPicker({
                              mode: "readwrite",
                            });
                            await saveDirHandle(h);
                            setDirHandle(h);
                          } catch (err) {
                            /* user cancelled picker */
                          }
                        }}
                      >
                        {dirHandle ? `📁 ${dirHandle.name}` : "📁 Set download folder"}
                      </Button>
                    )}
                    <Button
                      disabled={loading}
                      onClick={async () => {
                        if (s3.current) {
                          setLoading(true);
                          const files = await s3.current.listObjects();
                          setFiles(files);
                          setLoading(false);
                        }
                      }}
                    >
                      Reload
                    </Button>
                  </div>
                </div>
              )}
            </CardTitle>
            {files === null && (
              <CardDescription>
                Enter your AWS credentials below
              </CardDescription>
            )}
          </CardHeader>
          {renderForm()}
        </Card>
      </div>
      {renderFiles()}
    </>
  );
}

export default function S3FileSelect() {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<null | S3.ObjectList>(null);

  return (
    <S3FileSelectWrapped
      loading={loading}
      setLoading={setLoading}
      files={files}
      setFiles={setFiles}
    />
  );
}
