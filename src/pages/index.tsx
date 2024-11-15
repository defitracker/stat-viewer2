import FileUploader from "@/components/FileUploader";
import { useSqliteStore } from "@/util/sqliteStore";
import { useNavigate } from "react-router-dom";
import * as idb from "@/util/idb";
import { Button } from "@/components/ui/button";
import IndexLayout from "./_layout";
import { readDbTables, readSqlFile } from "@/util/helper";
import S3FileSelect from "@/components/S3FileSelect";

export default function Home() {
  const navigate = useNavigate();

  return (
    <IndexLayout
      topRight={
        <FileUploader
          onFilesAccepted={async (files) => {
            const file = files[0];
            const db = await readSqlFile(file);
            const tables = readDbTables(db);
            useSqliteStore.setState({ db, tables, filename: file.name });
            await idb.addFile(file);
            navigate("/sqlite");
          }}
        >
          <Button>Select file</Button>
        </FileUploader>
      }
    >
      <>
        {/*  */}
        <S3FileSelect />
      </>
    </IndexLayout>
  );
}
