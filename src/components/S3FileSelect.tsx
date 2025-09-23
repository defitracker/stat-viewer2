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
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { useSqliteStore } from "@/util/sqliteStore";
import { readDbTables, readSqlFile } from "@/util/helper";
import * as idb from "@/util/idb";
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
  applyPermaStoreValues,
  permaStoreInputs,
}: {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  files: null | S3.ObjectList;
  setFiles: React.Dispatch<React.SetStateAction<null | S3.ObjectList>>;
  applyPermaStoreValues: boolean;
  permaStoreInputs: any;
}) {
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

  if (applyPermaStoreValues && permaStoreInputs) {
    onSubmit(permaStoreInputs);
  }

  const s3 = useRef<S3Manager | undefined>(undefined);

  async function onSubmit(values: z.infer<typeof formSchema>) {
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
      //   useMyStore.getState().addToPermaStore("s3FileSelect", {
      //     inputValues: values,
      //   });
    } else {
      const e = maybeS3;
      console.error("S3Connect returned error", e);
    }

    setLoading(false);
  }

  const renderForm = () => {
    if (files !== null) return;
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="">
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
                    <Input placeholder="******" {...field} />
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
                    <Input placeholder="************" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button disabled={loading} className="w-full" type="submit">
              Connect
            </Button>
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
        navigate("/sqlite");
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
        remove: 0,
        remove2: 0,
      };
    });
    const colDefs: ColDef<FileData>[] = [
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
                <div className="flex justify-between">
                  Select file from S3 (${getFileSizeString(totalSize)})
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

  //   const permaStoreData = useMyStore.getState().permaStore["s3FileSelect"];
  //   console.log("permaStoreData", permaStoreData);

  //   const applyPermaStoreValues = permaStoreData && permaStoreData.inputValues && loading === false && files === null;

  return (
    <S3FileSelectWrapped
      loading={loading}
      setLoading={setLoading}
      files={files}
      setFiles={setFiles}
      applyPermaStoreValues={false}
      permaStoreInputs={{}}
      //   applyPermaStoreValues={applyPermaStoreValues}
      //   permaStoreInputs={permaStoreData?.inputValues}
    />
  );
}
