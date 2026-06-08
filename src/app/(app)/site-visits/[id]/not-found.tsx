import Link from "next/link";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SiteVisitNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <MapPin className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Site visit not found</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This visit may have been deleted or you don&apos;t have access to it.
      </p>
      <Button asChild className="mt-6">
        <Link href="/site-visits">Back to site visits</Link>
      </Button>
    </div>
  );
}
