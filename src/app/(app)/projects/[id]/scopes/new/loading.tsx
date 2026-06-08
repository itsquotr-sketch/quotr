import { Skeleton } from "@/components/ui/skeleton";

export default function NewScopeLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-64" />
      <Skeleton className="mb-4 h-12 w-full rounded-lg" />
      <Skeleton className="mb-4 h-24 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
