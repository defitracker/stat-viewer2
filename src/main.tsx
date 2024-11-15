import "./init"

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";

console.log("Rendering")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/stat-viewer2/">
      <App />
    </BrowserRouter>
  </StrictMode>
);
