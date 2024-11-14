// src/components/FileUploader.tsx
import React, { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import clsx from "clsx";
import { Button } from "./ui/button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

// Define the accepted file types
const ACCEPTED_FILE_TYPES = {
  "application/x-sqlite3": [".sqlite"],
};

interface FileUploaderProps {
  onFilesAccepted: (files: File[]) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAccepted }) => {
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
    <div className="w-full">
      <div
        {...getRootProps()}
        className={clsx("p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors", {
          "border-blue-500 bg-blue-50": isDragActive && !isDragReject,
          "border-red-500 bg-red-50": isDragReject,
          "border-gray-300 bg-white": !isDragActive,
        })}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v24a4 4 0 004 4h24a4 4 0 004-4V20"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></path>
            <path d="M28 8v16h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M20 24l8 8 12-12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
          <p className="mt-2 text-gray-500 text-center">Drag & drop some files here, or click to select files</p>
          <Button variant="default" className="mt-4">
            Browse Files
          </Button>
        </div>
      </div>

      {/* Display error messages */}
      {errorMessages.length > 0 && (
        <div className="mt-4">
          {errorMessages.map((msg, index) => (
            <Alert key={index} variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
