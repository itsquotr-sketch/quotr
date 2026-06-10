"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateScope } from "@/actions/scopes";
import type { ScopeActionState } from "@/lib/validations/scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SCOPE_STATUSES } from "@/lib/constants/projects";
import type { ProjectScope, ScopeType } from "@/types/database";

interface EditScopeFormProps {
  projectId: string;
  scope: ProjectScope;
  scopeTypes: ScopeType[];
}

export function EditScopeForm({
  projectId,
  scope,
  scopeTypes,
}: EditScopeFormProps) {
  const boundAction = updateScope.bind(null, projectId, scope.id);
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ScopeActionState
  );

  const [isCustom, setIsCustom] = useState(scope.is_custom);
  const [scopeTypeId, setScopeTypeId] = useState(scope.scope_type_id ?? "");
  const [status, setStatus] = useState(scope.status);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="isCustom" value={String(isCustom)} />
      <input type="hidden" name="scopeTypeId" value={isCustom ? "" : scopeTypeId} />
      <input type="hidden" name="status" value={status} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope type
        </h2>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={!isCustom ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsCustom(false)}
          >
            From list
          </Button>
          <Button
            type="button"
            variant={isCustom ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsCustom(true)}
          >
            Custom scope
          </Button>
        </div>

        {isCustom ? (
          <div className="space-y-2">
            <Label htmlFor="customScopeName">Custom scope name</Label>
            <Input
              id="customScopeName"
              name="customScopeName"
              defaultValue={scope.name}
            />
            {state.fieldErrors?.customScopeName && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.customScopeName[0]}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Scope type</Label>
            <Select value={scopeTypeId} onValueChange={setScopeTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select scope of work" />
              </SelectTrigger>
              <SelectContent>
                {scopeTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.scopeTypeId && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.scopeTypeId[0]}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope details
        </h2>

        {!isCustom && (
          <div className="space-y-2">
            <Label htmlFor="name">Display name (optional)</Label>
            <Input id="name" name="name" defaultValue={scope.name} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="locationArea">Location / area</Label>
          <Input
            id="locationArea"
            name="locationArea"
            defaultValue={scope.location_area ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={scope.description ?? ""}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={scope.notes ?? ""}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving scope…
          </>
        ) : (
          "Save scope"
        )}
      </Button>
    </form>
  );
}
