import { create } from "zustand";
import { Database } from "sql.js";

interface State {
  db: Database | null;
  filename: string | null;
  tables: string[];
}

export const useSqliteStore = create<State>()(() => ({
  db: null,
  filename: null,
  tables: [],
}));
