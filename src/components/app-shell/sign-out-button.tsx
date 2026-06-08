"use client";

import { useTransition } from "react";
import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
