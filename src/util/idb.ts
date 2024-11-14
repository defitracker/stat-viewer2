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
}

let dbPromise: Promise<IDBPDatabase<MyDB>>;

// Initialize the IndexedDB database
export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>("file-store", 1, {
      upgrade(db) {
        const store = db.createObjectStore("files", { keyPath: "name" });
        store.createIndex("by-createdAt", "createdAt");
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
