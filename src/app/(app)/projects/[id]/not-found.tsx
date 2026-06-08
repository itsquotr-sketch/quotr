import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Briefcase className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Project not found</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This project may have been deleted or you don&apos;t have access to it.
      </p>
      <Button asChild className="mt-6">
        <Link href="/projects">Back to projects</Link>
      </Button>
    </div>
  );
}
