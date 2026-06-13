import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import {
  buildEvaluateWorkAreas,
  evaluateAssistantProjectCompleteness,
} from "@/lib/assistant-v2/completeness/build-evaluate-input";
import type { AskRefinementPayload } from "@/lib/assistant-v2/intent/types";
import {
  formatScopeRefinementResponse,
  getScopeRefinementSuggestions,
  REFINEMENT_ACTION_CHIPS,
} from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";
import {
  createRefinementBatchId,
  fingerprintSuggestions,
} from "@/lib/assistant-v2/refinement/refinement-batch";
import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function executeAskRefinementQuestion(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: AskRefinementPayload;
  }
): Promise<CommandResult> {
  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId
  );

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  const { input } = await buildQuickEstimateInput(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (!input) {
    const message =
      "Add work areas and a few key details first — then I can tell you what would sharpen this estimate.";

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: message,
      metadata: {
        messageType: "assistant_text",
        commandIntent: "ask_refinement_question",
      },
    });

    return { success: true, message, estimateRecalculated: false };
  }

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("*, scope_types(name)")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  const scopeIds = (scopes ?? []).map((s) => s.id);
  const { data: scopeQuestions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  const workAreas = buildEvaluateWorkAreas(
    (scopes ?? []) as Parameters<typeof buildEvaluateWorkAreas>[0],
    scopeQuestions ?? [],
    null
  );

  evaluateAssistantProjectCompleteness({
    scopes: (scopes ?? []) as Parameters<
      typeof evaluateAssistantProjectCompleteness
    >[0]["scopes"],
    scopeQuestions: scopeQuestions ?? [],
    discovery: null,
    qualityLevel: normaliseQualityLevel(input.quickEstimate.quality_level),
    selectedConstraintSlugs: [],
    declinedConstraintSlugs: [],
  });

  const suggestions = getScopeRefinementSuggestions({
    workAreas,
    scopeId: params.payload.scopeId,
    scopeName: params.payload.scopeName,
    estimateTrace: summary?.estimateTrace,
    hasUserRates: input.scopeRates.some((r) => r.is_active),
    limit: 5,
  });

  const scopeName =
    params.payload.scopeName ??
    (params.payload.scopeId
      ? workAreas.find((a) => a.scopeId === params.payload.scopeId)?.scopeName
      : undefined);

  const message = formatScopeRefinementResponse(suggestions, {
    scopeName,
  });

  const closingLine =
    suggestions.length > 0
      ? "\n\nWant to answer these now?"
      : "";

  const fullMessage = `${message}${closingLine}`;

  const refinementBatchId = createRefinementBatchId();
  const suggestionsFingerprint = fingerprintSuggestions(suggestions);

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: fullMessage,
    metadata: {
      messageType: "refinement_suggestions",
      commandIntent: "ask_refinement_question",
      refinementBatchId,
      suggestionsFingerprint,
      scopeId: params.payload.scopeId ?? null,
      scopeName: scopeName ?? null,
      suggestions,
      sharpeningSuggestions: suggestions,
      sharpenOptions: [...REFINEMENT_ACTION_CHIPS],
    },
  });

  return {
    success: true,
    message: fullMessage,
    estimateRecalculated: false,
  };
}
