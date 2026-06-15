"use client";

import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  projectId: string;
};

type State = {
  hasError: boolean;
};

export class AssistantErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AssistantErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-lg font-semibold">
              Something went wrong loading the project assistant.
            </h1>
            <p className="text-sm text-muted-foreground">
              Your project data is still saved. Try reloading the assistant.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                onClick={() => this.setState({ hasError: false })}
              >
                Retry
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Refresh page
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/projects/${this.props.projectId}/legacy`}>
                  Open legacy view
                </Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
