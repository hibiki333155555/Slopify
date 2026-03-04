import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const rootNode = document.getElementById("root");
if (!rootNode) {
  throw new Error("Renderer root element not found");
}

createRoot(rootNode).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
