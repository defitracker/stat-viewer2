import { Button } from "@/components/ui/button";
import { useSqliteStore } from "@/util/sqliteStore";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import SQLiteLayout from "./_layout";

export default function SqliteHome() {
  const { db } = useSqliteStore(
    useShallow((state) => ({
      db: state.db,
    }))
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (!db) {
      return navigate("/");
    }
  }, [db]);

  if (!db) return <></>;

  return (
    <SQLiteLayout>
      <>
        <p>Select table</p>
      </>
    </SQLiteLayout>
  );
}
