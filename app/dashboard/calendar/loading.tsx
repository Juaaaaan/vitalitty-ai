import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="min-h-screen p-6 bg-background">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-7 w-40 rounded-md flex-1" />
        <Skeleton className="h-9 w-56 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Grid + side panel skeleton */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar grid skeleton */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="m-2 h-4 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[90px] border-b border-r p-1.5">
                <Skeleton className="h-6 w-6 rounded-full mb-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Side panel skeleton */}
        <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-4 h-fit">
          <Skeleton className="h-5 w-32 rounded" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 flex flex-col gap-1">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
