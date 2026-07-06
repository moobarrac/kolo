// Loading placeholders. A soft pulsing block that matches the surface palette,
// so loading reads as "content is coming" rather than a jarring spinner.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}

/** A full card placeholder (rounded surface with a few lines). */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-ink/5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-48" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

/** A few stacked row placeholders for lists. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
        </li>
      ))}
    </ul>
  );
}
