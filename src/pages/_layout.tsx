import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";

import * as idb from "@/util/idb";
import { useNavigate } from "react-router-dom";
import { readDbTables, readSqlFile } from "@/util/helper";
import { useSqliteStore } from "@/util/sqliteStore";
import { X } from "lucide-react";

interface StoredFile {
  name: string;
  size: number;
  type: string;
  data: Blob;
  createdAt: number;
}

export default function IndexLayout({ children, topRight }: { children: React.ReactNode; topRight?: React.ReactNode }) {
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStoredFiles();
  }, []);

  const fetchStoredFiles = async () => {
    try {
      const files = await idb.getAllFiles();
      setStoredFiles(files);
    } catch (error) {
      console.error("Error fetching files from IndexedDB:", error);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar
        sublocation="file select"
        navMain={[
          {
            title: "Local files",
            url: "#",
            items: storedFiles
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((file) => ({
                title: file.name,
                url: "#",
                onClick: async () => {
                  const db = await readSqlFile(file.data);
                  const tables = readDbTables(db);
                  useSqliteStore.setState({ db, tables, filename: file.name });
                  navigate("/sqlite");
                },
                rightItem: (
                  <div
                    className="cursor-pointer hover:bg-secondary px-1 rounded-sm"
                    onClick={async () => {
                      await idb.deleteFile(file.name);
                      fetchStoredFiles();
                    }}
                  >
                    <X className="w-4" />
                  </div>
                ),
              })),
          },
        ]}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">Home, file select</BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">{topRight}</div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
