import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useSqliteStore } from "@/util/sqliteStore";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

export default function SQLiteLayout({ children }: { children: React.ReactNode }) {
  const { tables } = useSqliteStore(
    useShallow((state) => ({
      tables: state.tables,
    }))
  );

  const location = useLocation();
  const selectedTable = location.pathname.split("/")[2];

  return (
    <SidebarProvider>
      <AppSidebar
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
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
