import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSqliteStore } from "@/util/sqliteStore";
import { Download, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import * as idb from "@/util/idb";
import type { PinnedEntry } from "@/util/idb";

export default function SQLiteLayout({ children }: { children: React.ReactNode }) {
  const { tables, filename, db } = useSqliteStore(
    useShallow((state) => ({
      filename: state.filename,
      tables: state.tables,
      db: state.db,
    }))
  );

  const [pinnedEntries, setPinnedEntries] = useState<PinnedEntry[]>([]);

  const fetchPinnedEntries = async () => {
    if (!filename) return;
    const entries = await idb.getPinnedEntries(filename);
    setPinnedEntries(entries.sort((a, b) => b.pinnedAt - a.pinnedAt));
    useSqliteStore.setState({ pinnedVersion: useSqliteStore.getState().pinnedVersion + 1 });
  };

  useEffect(() => {
    fetchPinnedEntries();
  }, [filename]);

  // Expose refetch for child components
  useEffect(() => {
    useSqliteStore.setState({ _refreshPinnedEntries: fetchPinnedEntries } as any);
  }, [filename]);

  const handleDownload = () => {
    if (!db || !filename) return;
    const data = db.export();
    const blob = new Blob([data], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const location = useLocation();
  const selectedTable = location.pathname.split("/")[2];

  return (
    <SidebarProvider>
      <AppSidebar
        sublocation="sqlite"
        navMain={[
          {
            title: "Tables",
            url: "#",
            items: tables.map((table) => ({
              title: table,
              url: `/sqlite/${table}`,
              isActive: table === selectedTable,
            })),
          },
          ...(pinnedEntries.length > 0
            ? [
                {
                  title: "Pinned",
                  url: "#",
                  titleAction: (
                    <div
                      className="cursor-pointer hover:bg-secondary p-0.5 rounded-sm"
                      onClick={async () => {
                        if (!filename) return;
                        if (!window.confirm(`Unpin all ${pinnedEntries.length} entries?`)) return;
                        await idb.deletePinnedEntriesByFilename(filename);
                        fetchPinnedEntries();
                      }}
                      title="Unpin all entries"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </div>
                  ),
                  items: pinnedEntries.map((entry) => {
                    let displayName = `${entry.table}-${entry.entryId.slice(0, 4)}`;
                    if (db) {
                      try {
                        if (entry.table === "Iteration") {
                          const res = db.exec(`SELECT tokenId, networkA, networkB FROM Iteration WHERE id = "${entry.entryId}"`)[0];
                          if (res?.values?.[0]) {
                            const [tokenId, netA, netB] = res.values[0] as string[];
                            displayName = `It-${tokenId}-${(netA || "").slice(0, 3)}-${(netB || "").slice(0, 3)}-${entry.entryId.slice(0, 4)}`;
                          }
                        } else if (entry.table === "Event") {
                          const res = db.exec(`SELECT network, dependantTokensJsonList FROM Event WHERE id = "${entry.entryId}"`)[0];
                          if (res?.values?.[0]) {
                            const [network, depTokensJson] = res.values[0] as string[];
                            let tokenPart = "";
                            try {
                              const tokens = JSON.parse(depTokensJson || "[]");
                              if (tokens.length > 0) {
                                tokenPart = `-${tokens[0]}${tokens.length > 1 ? "+" : ""}`;
                              }
                            } catch {}
                            displayName = `Ev-${network}${tokenPart}-${entry.entryId.slice(0, 4)}`;
                          }
                        }
                      } catch {}
                    }
                    return {
                    title: displayName,
                    url: "#",
                    onClick: () => {
                      useSqliteStore.setState({ pinnedEntryToOpen: { table: entry.table, entryId: entry.entryId } });
                    },
                    rightItem: (
                      <div
                        className="cursor-pointer hover:bg-secondary px-1 rounded-sm"
                        onClick={async (e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (entry.id != null) {
                            await idb.deletePinnedEntry(entry.id);
                            fetchPinnedEntries();
                          }
                        }}
                      >
                        <X className="w-4" />
                      </div>
                    ),
                  }}),
                },
              ]
            : []),
        ]}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <Link className="transition-colors hover:text-foreground" to={"/sqlite"}>
                  {"SQLite"}
                </Link>
              </BreadcrumbItem>
              {selectedTable && (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{`${selectedTable}'s table`}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            {filename}
            {db && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
