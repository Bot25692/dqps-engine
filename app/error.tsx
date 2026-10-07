'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-xl font-bold text-red-400 mb-2">Runtime Error Detected</h2>
      <pre className="text-xs text-red-300 bg-slate-900 p-4 rounded border border-slate-800 max-w-xl text-left overflow-x-auto mb-6">
        {error.stack || error.message || String(error)}
      </pre>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 text-sm font-medium"
      >
        Try Again
      </button>
    </div>
  );
}
