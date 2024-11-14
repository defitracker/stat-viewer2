import { create } from "zustand";
import { Database } from "sql.js";

interface State {
  db: Database | null;
  tables: string[];
}

export const useSqliteStore = create<State>()((set) => ({
  db: null,
  tables: [],
}));
