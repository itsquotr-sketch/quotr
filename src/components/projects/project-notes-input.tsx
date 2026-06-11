"use client";

import { ProjectAssistantNotesForm } from "@/components/projects/project-assistant-notes-form";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";

interface ProjectNotesInputProps {
  projectId: string;
  discoveryMeta: ProjectDiscoveryMeta;
}

/** Chat-ready notes input shell — textarea today, conversational input later. */
export function ProjectNotesInput({
  projectId,
  discoveryMeta,
}: ProjectNotesInputProps) {
  return (
    <ProjectAssistantNotesForm
      projectId={projectId}
      discoveryMeta={discoveryMeta}
    />
  );
}
