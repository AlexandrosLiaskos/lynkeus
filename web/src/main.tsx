import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import "@fontsource/eb-garamond/latin-500.css";
import "@fontsource/eb-garamond/latin-500-italic.css";
import "ol/ol.css";
import "./styles.scss";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error('The page has no element with the id "root".');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
