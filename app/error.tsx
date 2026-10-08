"use client";

// Keep invalid/unavailable datasets recoverable without exposing server diagnostics.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel p-6" role="alert">
    <h1>Data temporarily unavailable</h1>
    <p>The dataset could not be loaded or validated. No result has been fabricated.</p>
    <button className="button button-secondary" onClick={reset}>Retry</button>
  </section>;
}
