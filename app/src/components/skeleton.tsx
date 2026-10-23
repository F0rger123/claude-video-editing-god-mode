/**
 * Instant placeholder shown the moment a screen is tapped, while its data loads. Having a loading
 * boundary also lets Next.js prefetch every visible link up to this point, so navigation feels
 * immediate instead of waiting on the server.
 */
export function ScreenSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <div className="mb-2 h-4 w-28 rounded-full bg-graphite" />
      <div className="mb-8 h-10 w-56 rounded-xl bg-graphite" />
      <div className="mb-6 h-16 rounded-3xl bg-char" />
      <div className="grid gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-16 rounded-2xl border border-rule bg-coal" />
        ))}
      </div>
    </div>
  );
}
