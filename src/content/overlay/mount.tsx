import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import stylesText from "./styles.css?inline";
import type { BaselineTask } from "../parser";

const CONTAINER_ID = "baseline-helper-root";

export function mountOverlay(task: BaselineTask) {
  if (document.getElementById(CONTAINER_ID)) return;

  const host = document.createElement("div");
  host.id = CONTAINER_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = stylesText;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <React.StrictMode>
      <App task={task} />
    </React.StrictMode>
  );
}