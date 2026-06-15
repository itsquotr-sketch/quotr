"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ProjectAssistantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const projectId = params?.id as string | undefined;

  useEffect(() => {
    console.error("[ProjectAssistantError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-lg font-semibold">
          Something went wrong loading the project assistant.
        </h1>
        <p className="text-sm text-muted-foreground">
          Your project data is still saved. Try reloading the assistant or open
          the legacy view.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={() => reset()}>
            Retry
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Refresh page
          </Button>
          {projectId && (
            <Button type="button" variant="outline" asChild>
              <Link href={`/projects/${projectId}/legacy`}>
                Open legacy view
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
