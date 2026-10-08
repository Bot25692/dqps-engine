"use client";

import { useSyncExternalStore } from "react";

export type DatasetId = "apparel" | "skincare";

function subscribe(callback: () => void) {
  window.addEventListener("focus", callback);
  return () => window.removeEventListener("focus", callback);
}

function getSnapshot(): DatasetId {
  if (typeof document === "undefined") return "apparel";
  const match = document.cookie.match(/adapt_dataset=([^;]+)/);
  if (match && match[1] === "skincare") return "skincare";
  return "apparel";
}

function getServerSnapshot(): DatasetId {
  return "apparel";
}

export function DatasetSelector() {
  const dataset = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function handleDatasetChange(next: DatasetId) {
    if (next === dataset) return;
    document.cookie = `adapt_dataset=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("adapt_dataset", next);
    } catch {}
    // Hard refresh so all server components and layouts re-evaluate with the selected dataset
    window.location.reload();
  }

  return (
    <div className="dataset-selector-wrapper">
      <label htmlFor="dataset-select" className="sr-only">
        Select Dataset
      </label>
      <div className="dataset-pill">
        <span
          className="dataset-indicator"
          style={{
            backgroundColor: dataset === "skincare" ? "var(--cyan, #38bdf8)" : "var(--orange, #f97316)",
            boxShadow: dataset === "skincare" ? "0 0 5px rgba(56,189,248,0.5)" : "0 0 5px rgba(249,115,22,0.5)",
          }}
        />
        <select
          id="dataset-select"
          className="dataset-select"
          value={dataset}
          onChange={(e) => handleDatasetChange(e.target.value as DatasetId)}
          aria-label="Active Dataset"
        >
          <option value="apparel">Apparel & Footwear (2026)</option>
          <option value="skincare">Skincare (2025)</option>
        </select>
        <svg
          className="dataset-select-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
