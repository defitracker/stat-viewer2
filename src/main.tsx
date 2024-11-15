import "./init"

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter, MemoryRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";

console.log("Rendering")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* <HashRouter basename="/stat-viewer2/"> */}
    <MemoryRouter basename="/">
      <App />
    </MemoryRouter>
  </StrictMode>
);
