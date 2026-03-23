// src/utils/db.ts
import { openDB, DBSchema, IDBPDatabase } from "idb";

// Define the database schema
interface MyDB extends DBSchema {
  files: {
    key: string; // Use file name or a unique identifier as the key
    value: {
      name: string;
      size: number;
      type: string;
      data: Blob; // Store the file as a Blob
      createdAt: number; // Timestamp for when the file was added
    };
    indexes: { "by-createdAt": number };
  };
  "pinned-entries": {
    key: number;
    value: {
      id?: number;
      filename: string;
      table: string;
      entryId: string;
      pinnedAt: number;
    };
    indexes: { "by-filename": string };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>>;

// Initialize the IndexedDB database
export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>("file-store", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) {
          const store = db.createObjectStore("files", { keyPath: "name" });
          store.createIndex("by-createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("pinned-entries")) {
          const pinnedStore = db.createObjectStore("pinned-entries", { keyPath: "id", autoIncrement: true });
          pinnedStore.createIndex("by-filename", "filename");
        }
      },
    });
  }
  return dbPromise;
}

// Add a file to IndexedDB
export async function addFile(file: File): Promise<void> {
  const db = await initDB();
  await db.put("files", {
    name: file.name,
    size: file.size,
    type: file.type,
    data: file,
    createdAt: Date.now(),
  });
}

// Get all files from IndexedDB
export async function getAllFiles(): Promise<
  Array<{
    name: string;
    size: number;
    type: string;
    data: Blob;
    createdAt: number;
  }>
> {
  const db = await initDB();
  return db.getAll("files");
}

// Delete a file from IndexedDB by name
export async function deleteFile(name: string): Promise<void> {
  const db = await initDB();
  await db.delete("files", name);
}

// Get a single file by name
export async function getFile(name: string): Promise<
  | {
      name: string;
      size: number;
      type: string;
      data: Blob;
      createdAt: number;
    }
  | undefined
> {
  const db = await initDB();
  return db.get("files", name);
}

// Pinned entries

export interface PinnedEntry {
  id?: number;
  filename: string;
  table: string;
  entryId: string;
  pinnedAt: number;
}

export async function addPinnedEntry(filename: string, table: string, entryId: string): Promise<void> {
  const db = await initDB();
  await db.add("pinned-entries", { filename, table, entryId, pinnedAt: Date.now() });
}

export async function getPinnedEntries(filename: string): Promise<PinnedEntry[]> {
  const db = await initDB();
  return db.getAllFromIndex("pinned-entries", "by-filename", filename);
}

export async function getAllPinnedEntries(): Promise<PinnedEntry[]> {
  const db = await initDB();
  return db.getAll("pinned-entries");
}

export async function deletePinnedEntry(id: number): Promise<void> {
  const db = await initDB();
  await db.delete("pinned-entries", id);
}

export async function deletePinnedEntriesByFilename(filename: string): Promise<void> {
  const entries = await getPinnedEntries(filename);
  const db = await initDB();
  const tx = db.transaction("pinned-entries", "readwrite");
  for (const entry of entries) {
    if (entry.id != null) tx.store.delete(entry.id);
  }
  await tx.done;
}
