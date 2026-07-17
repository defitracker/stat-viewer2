import routes from "~react-pages";
import { useRoutes } from "react-router-dom";
import { Suspense } from "react";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { LicenseManager } from "ag-grid-enterprise";
import { Toaster } from "@/components/Toaster";
LicenseManager.setLicenseKey("DownloadDevTools_COM_NDEwMjM0NTgwMDAwMA==59158b5225400879a12a96634544f5b6");

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      {useRoutes(routes)}
      <Toaster />
    </Suspense>
  );
}

export default App;
