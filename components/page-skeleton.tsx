export function PageSkeleton({ tiles = 4, rows = 5 }: { tiles?: number; rows?: number }) {
  return (
    <main className="min-h-dvh bg-paper" aria-busy="true" aria-label="Loading">
      <div className="h-14 bg-ink" />
      <div className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-4 px-3 py-5 md:px-5">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-line" />
            <div className="h-7 w-64 rounded-lg bg-line" />
          </div>
          <div className="h-10 w-56 rounded-xl bg-line" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="h-[74px] rounded-2xl bg-panel" />
          ))}
        </div>
        <div className="card divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="h-5 w-12 rounded bg-line" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-line" />
                <div className="h-3 w-1/2 rounded bg-line/70" />
              </div>
              <div className="h-10 w-24 rounded-xl bg-line/70" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
