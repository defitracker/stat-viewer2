import FileUploader from "@/components/FileUploader";
import { useSqliteStore } from "@/util/sqliteStore";
import initSqlJs, { Database } from "sql.js";
import { useNavigate } from "react-router-dom";
import * as idb from "@/util/idb";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

async function readSqlFile(file: Blob) {
  const arrayBuffer = await file.arrayBuffer();
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const db = new SQL.Database(new Uint8Array(arrayBuffer));
  return db;
}

function readDbTables(db: Database) {
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  const tables = tablesRes.length > 0 ? tablesRes[0].values.flat() : [];
  return tables as string[];
}

export default function Home() {
  const navigate = useNavigate();

  return (
    <div>
      <LocalFiles />
      <FileUploader
        onFilesAccepted={async (files) => {
          const file = files[0];
          const db = await readSqlFile(file);
          const tables = readDbTables(db);
          useSqliteStore.setState({ db, tables });
          await idb.addFile(file);
          navigate("/sqlite");
        }}
      />
    </div>
  );
}

interface StoredFile {
  name: string;
  size: number;
  type: string;
  data: Blob;
  createdAt: number;
}

function LocalFiles() {
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
    <>
      <div>Local files:</div>
      <div>
        {storedFiles.map((f) => (
          <Button
            key={f.name}
            onClick={async () => {
              const db = await readSqlFile(f.data);
              const tables = readDbTables(db);
              useSqliteStore.setState({ db, tables });
              navigate("/sqlite");
            }}
          >
            {f.name}
          </Button>
        ))}
      </div>
    </>
  );
}
