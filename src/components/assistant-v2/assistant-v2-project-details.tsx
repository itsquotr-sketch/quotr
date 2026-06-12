"use client";

import { useState } from "react";
import { ChevronDown, Mail, MapPin, Phone } from "lucide-react";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_STATUSES,
  PROJECT_PRIORITIES,
  labelFor,
} from "@/lib/constants/projects";
import { formatDateTime } from "@/lib/utils";
import type { Project } from "@/types/database";
import { cn } from "@/lib/utils";

interface AssistantV2ProjectDetailsProps {
  project: Project;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

export function AssistantV2ProjectDetails({
  project,
  clientName,
  clientPhone,
  clientEmail,
}: AssistantV2ProjectDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">Project details</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t px-4 py-3 text-sm sm:grid-cols-2">
          <DetailItem label="Client" value={clientName} />
          {clientPhone ? (
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="mt-0.5 font-medium">
                <a
                  href={`tel:${clientPhone}`}
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {clientPhone}
                </a>
              </dd>
            </div>
          ) : (
            <DetailItem label="Phone" value="—" />
          )}
          {clientEmail ? (
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-0.5 font-medium">
                <a
                  href={`mailto:${clientEmail}`}
                  className="inline-flex items-center gap-1.5 break-all text-primary hover:underline"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {clientEmail}
                </a>
              </dd>
            </div>
          ) : (
            <DetailItem label="Email" value="—" />
          )}
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Site address</dt>
            <dd className="mt-0.5 inline-flex items-start gap-1.5 font-medium">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {project.site_address}
            </dd>
          </div>
          <DetailItem
            label="Enquiry source"
            value={labelFor(ENQUIRY_SOURCES, project.enquiry_source)}
          />
          <DetailItem
            label="Enquiry status"
            value={labelFor(ENQUIRY_STATUSES, project.enquiry_status)}
          />
          <DetailItem
            label="Priority"
            value={labelFor(PROJECT_PRIORITIES, project.priority)}
          />
          <DetailItem
            label="Created"
            value={formatDateTime(project.created_at)}
          />
        </dl>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
