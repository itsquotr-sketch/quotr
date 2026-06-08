import { Skeleton } from "@/components/ui/skeleton";

export default function ScopeDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-4 h-8 w-2/3" />
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="mb-4 h-36 w-full rounded-xl" />
      <Skeleton className="mb-4 h-48 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
