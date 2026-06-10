"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateProject } from "@/actions/projects";
import type { ProjectActionState } from "@/lib/validations/project";
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
import {
  ENQUIRY_SOURCES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
} from "@/lib/constants/projects";
import type { Project } from "@/types/database";

interface EditProjectFormProps {
  project: Project;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

export function EditProjectForm({
  project,
  clientName,
  clientPhone,
  clientEmail,
}: EditProjectFormProps) {
  const boundAction = updateProject.bind(null, project.id);
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ProjectActionState
  );

  const [enquirySource, setEnquirySource] = useState(project.enquiry_source);
  const [priority, setPriority] = useState(project.priority);
  const [status, setStatus] = useState(project.status);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="enquirySource" value={enquirySource} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="status" value={status} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project details
        </h2>

        <div className="space-y-2">
          <Label htmlFor="title">Project title</Label>
          <Input id="title" name="title" defaultValue={project.title} required />
          {state.fieldErrors?.title && (
            <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientName">Client name</Label>
          <Input
            id="clientName"
            name="clientName"
            defaultValue={clientName === "—" ? "" : clientName}
            required
          />
          {state.fieldErrors?.clientName && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.clientName[0]}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="clientPhone">Client phone</Label>
            <Input
              id="clientPhone"
              name="clientPhone"
              type="tel"
              defaultValue={clientPhone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientEmail">Client email</Label>
            <Input
              id="clientEmail"
              name="clientEmail"
              type="email"
              defaultValue={clientEmail ?? ""}
            />
            {state.fieldErrors?.clientEmail && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.clientEmail[0]}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteAddress">Site address</Label>
          <Input
            id="siteAddress"
            name="siteAddress"
            defaultValue={project.site_address}
            required
          />
          {state.fieldErrors?.siteAddress && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.siteAddress[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Enquiry source</Label>
          <Select value={enquirySource} onValueChange={setEnquirySource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENQUIRY_SOURCES.map((source) => (
                <SelectItem key={source.value} value={source.value}>
                  {source.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.status && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.status[0]}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Client brief
        </h2>
        <Textarea
          name="clientBrief"
          defaultValue={project.client_brief ?? ""}
          rows={4}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h2>
        <Textarea
          name="initialNotes"
          defaultValue={project.description ?? ""}
          placeholder="Initial notes, access, timing, budget hints…"
          rows={4}
        />
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
            Saving changes…
          </>
        ) : (
          "Save project"
        )}
      </Button>
    </form>
  );
}
