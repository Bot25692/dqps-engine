"use client";

// Keep invalid/unavailable datasets recoverable without exposing server diagnostics.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="host-empty host-error" role="alert">
    <h1>Data temporarily unavailable</h1>
    <p>The dataset could not be loaded or validated. No result has been fabricated.</p>
    <button className="action-secondary" onClick={reset}>Retry</button>
  </section>;
}
