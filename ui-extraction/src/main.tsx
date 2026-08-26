import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Showcase } from "./showcase/Showcase";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Showcase /></StrictMode>,
);
