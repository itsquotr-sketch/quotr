import { isOpenAiDiscoveryAvailable } from "@/lib/ai/discovery/openai-discovery-provider";
import {
  getLatestDiscoveryEngineRun,
  parseDiscoveryEngineRun,
} from "@/lib/discovery-data";

export type ProjectDiscoveryMeta = {
  providerLabel: string;
  confidence: number | null;
  analysedAt: string | null;
  usedFallback: boolean;
  aiAvailable: boolean;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "AI analysis",
  rule_based: "Basic rules",
  "rule-based": "Basic rules",
  pending: "Analysis",
};

export async function getProjectDiscoveryMeta(
  supabase: Parameters<typeof getLatestDiscoveryEngineRun>[0],
  organisationId: string,
  projectId: string
): Promise<ProjectDiscoveryMeta> {
  const { data: engineRun } = await getLatestDiscoveryEngineRun(
    supabase,
    organisationId,
    projectId
  );

  const parsed = parseDiscoveryEngineRun(engineRun ?? null);

  return {
    providerLabel:
      PROVIDER_LABELS[engineRun?.provider ?? ""] ?? "Basic rules",
    confidence: parsed?.confidence ?? null,
    analysedAt: engineRun?.created_at ?? null,
    usedFallback: Boolean(engineRun?.error_message),
    aiAvailable: isOpenAiDiscoveryAvailable(),
  };
}
