"use client";

import { BrainDumpPanel } from "@/components/projects/brain-dump-panel";
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
    <BrainDumpPanel projectId={projectId} discoveryMeta={discoveryMeta} />
  );
}
