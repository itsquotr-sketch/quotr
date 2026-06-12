"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  addProjectTrade,
  removeProjectTrade,
} from "@/actions/project-trades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectScope, ProjectTrade } from "@/types/database";
import { cn } from "@/lib/utils";

export type DisplayTrade = {
  id?: string;
  name: string;
  source: "ai" | "template" | "user";
  note?: string | null;
};

interface LikelyTradesEditorProps {
  projectId: string;
  trades: DisplayTrade[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  userTrades: ProjectTrade[];
}

export function LikelyTradesEditor({
  projectId,
  trades,
  confirmedScopes,
  userTrades,
}: LikelyTradesEditorProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [removePending, startRemove] = useTransition();

  if (trades.length === 0 && userTrades.length === 0) {
    return null;
  }

  function handleRemove(tradeId: string) {
    startRemove(async () => {
      await removeProjectTrade(projectId, tradeId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {trades.map((trade) => (
          <span
            key={`${trade.source}-${trade.name}-${trade.id ?? ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
              trade.source === "user" && "border-primary/30 bg-primary/5"
            )}
          >
            <span className="font-medium">{trade.name}</span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {trade.source}
            </span>
            {trade.id && trade.source === "user" && (
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                disabled={removePending}
                onClick={() => handleRemove(trade.id!)}
                aria-label={`Remove ${trade.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {showAdd ? (
        <AddTradeForm
          projectId={projectId}
          confirmedScopes={confirmedScopes}
          onDone={() => {
            setShowAdd(false);
            router.refresh();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowAdd(true)}
        >
          Add trade
        </Button>
      )}
    </div>
  );
}

function AddTradeForm({
  projectId,
  confirmedScopes,
  onDone,
  onCancel,
}: {
  projectId: string;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await addProjectTrade(projectId, {}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-2">
      <div className="space-y-1">
        <Label htmlFor="tradeName" className="text-xs">
          Trade name
        </Label>
        <Input
          id="tradeName"
          name="tradeName"
          placeholder="e.g. Landscaper"
          className="h-8 text-sm"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tradeNote" className="text-xs">
          Note (optional)
        </Label>
        <Input id="tradeNote" name="note" className="h-8 text-sm" />
      </div>
      {confirmedScopes.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="projectScopeId" className="text-xs">
            Linked work area (optional)
          </Label>
          <select
            id="projectScopeId"
            name="projectScopeId"
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">None</option>
            {confirmedScopes.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="h-7 text-xs">
          {pending ? "Adding…" : "Save trade"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
