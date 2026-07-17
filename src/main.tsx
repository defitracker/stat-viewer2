import "./init"

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter basename="/">
      <App />
    </MemoryRouter>
  </StrictMode>
);
