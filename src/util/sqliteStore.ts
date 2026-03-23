import { create } from "zustand";
import { Database } from "sql.js";

interface State {
  db: Database | null;
  filename: string | null;
  tables: string[];
  pinnedEntryToOpen: { table: string; entryId: string } | null;
  pinnedVersion: number;
}

export const useSqliteStore = create<State>()(() => ({
  db: null,
  filename: null,
  tables: [],
  pinnedEntryToOpen: null,
  pinnedVersion: 0,
}));
