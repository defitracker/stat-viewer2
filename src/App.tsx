import routes from "~react-pages";
import { useRoutes } from "react-router-dom";
import { Suspense } from "react";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { ModuleRegistry, provideGlobalGridOptions } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import { Toaster } from "@/components/Toaster";

// v33+ requires explicit module registration, and defaults to the new JS
// Theming API — opt back into the CSS-file themes above (ag-theme-quartz)
// so existing styling keeps working unchanged.
ModuleRegistry.registerModules([AllEnterpriseModule]);
provideGlobalGridOptions({ theme: "legacy" });

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
