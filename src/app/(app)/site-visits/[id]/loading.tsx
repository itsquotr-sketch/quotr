import { Skeleton } from "@/components/ui/skeleton";

export default function SiteVisitDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-6 h-8 w-3/4" />
      <Skeleton className="mb-4 h-48 w-full rounded-xl" />
      <Skeleton className="mb-4 h-32 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
