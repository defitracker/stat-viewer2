// src/components/FileUploader.tsx
import React, { useCallback, useState } from "react";
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
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // Clear previous errors
      setErrorMessages([]);

      // Handle accepted files
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }

      // Handle rejected files
      if (fileRejections.length > 0) {
        const errors = fileRejections.map((rejection) => {
          const { file, errors } = rejection;
          return `${file.name} - ${errors.map((e) => e.message).join(", ")}`;
        });
        setErrorMessages(errors);
      }
    },
    [onFilesAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject, isDragAccept } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    // multiple: true,
  });

  return (
    <div {...getRootProps()}>
      {children}
      <input {...getInputProps()} />
    </div>
  );
};

export default FileUploader;
