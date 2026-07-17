// src/components/FileUploader.tsx
import React, { useCallback } from "react";
import { useDropzone, FileRejection } from "react-dropzone";

// Define the accepted file types
const ACCEPTED_FILE_TYPES = {
  "application/x-sqlite3": [".sqlite"],
};

interface FileUploaderProps {
  onFilesAccepted: (files: File[]) => void;
  children: React.ReactNode;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAccepted, children }) => {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
      for (const { file, errors } of fileRejections) {
        console.error(`Rejected ${file.name}: ${errors.map((e) => e.message).join(", ")}`);
      }
    },
    [onFilesAccepted]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
  });

  return (
    <div {...getRootProps()}>
      {children}
      <input {...getInputProps()} />
    </div>
  );
};

export default FileUploader;
