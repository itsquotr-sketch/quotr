import {
  insertAssistantMessage,
  listAssistantMessages,
  updateAssistantMessageMetadata,
} from "@/lib/assistant-v2/assistant-messages-data";
import {
  buildEvaluateWorkAreas,
} from "@/lib/assistant-v2/completeness/build-evaluate-input";
import {
  getCurrentMissingItems,
  getCriticalOrUsefulMissing,
  getOptionalMissing,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  getScopeRefinementSuggestions,
  scopeRefinementSuggestionSchema,
  type ScopeRefinementSuggestion,
} from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  buildRefinementBatchIntro,
  createRefinementBatchId,
  fingerprintSuggestions,
  refinementAnswerQuestionSchema,
} from "@/lib/assistant-v2/refinement/refinement-batch";
import {
  MAX_REFINEMENT_QUESTIONS,
  suggestionsToPricingQuestions,
} from "@/lib/assistant-v2/refinement/suggestions-to-pricing-questions";
import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { z } from "zod";

type Supabase = SupabaseClient<Database>;

export type RefinementActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  estimateRecalculated?: boolean;
};

const refinementActionParamsSchema = z.object({
  projectId: z.string().uuid(),
  refinementBatchId: z.string().optional(),
  sourceMessageId: z.string().uuid().optional(),
});

async function loadRefinementSuggestions(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    refinementBatchId?: string;
    sourceMessageId?: string;
  }
): Promise<{
  suggestions: ScopeRefinementSuggestion[];
  refinementBatchId: string;
  suggestionsFingerprint: string;
  sourceMessageId?: string;
  scopeName?: string | null;
}> {
  const { data: messages } = await listAssistantMessages(
    supabase,
    params.organisationId,
    params.projectId
  );

  let sourceMessage = params.sourceMessageId
    ? messages.find((m) => m.id === params.sourceMessageId)
    : undefined;

  if (!sourceMessage && params.refinementBatchId) {
    sourceMessage = [...messages]
      .reverse()
      .find((m) => {
        const meta = m.metadata as Record<string, unknown> | null;
        return meta?.refinementBatchId === params.refinementBatchId;
      });
  }

  const meta = sourceMessage?.metadata as Record<string, unknown> | null;
  const storedSuggestions = meta?.suggestions ?? meta?.sharpeningSuggestions;

  if (Array.isArray(storedSuggestions) && storedSuggestions.length > 0) {
    const suggestions = storedSuggestions.map((item) =>
      scopeRefinementSuggestionSchema.parse(item)
    );
    return {
      suggestions,
      refinementBatchId:
        (meta?.refinementBatchId as string) ??
        params.refinementBatchId ??
        createRefinementBatchId(),
      suggestionsFingerprint:
        (meta?.suggestionsFingerprint as string) ??
        fingerprintSuggestions(suggestions),
      sourceMessageId: sourceMessage?.id,
      scopeName: (meta?.scopeName as string | null) ?? null,
    };
  }

  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

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
    return {
      suggestions: [],
      refinementBatchId: params.refinementBatchId ?? createRefinementBatchId(),
      suggestionsFingerprint: "",
    };
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

  const suggestions = getScopeRefinementSuggestions({
    workAreas,
    estimateTrace: summary?.estimateTrace,
    hasUserRates: input.scopeRates.some((r) => r.is_active),
    limit: 5,
  });

  return {
    suggestions,
    refinementBatchId: params.refinementBatchId ?? createRefinementBatchId(),
    suggestionsFingerprint: fingerprintSuggestions(suggestions),
  };
}

function buildScopeGroups(
  scopes: {
    id: string;
    name: string;
    scope_types: { name: string } | null;
  }[]
): ScopeGroupInput[] {
  return scopes.map((scope) => ({
    scopeId: scope.id,
    scopeName: scope.name,
    scopeTypeName: scope.scope_types?.name ?? null,
    questions: [],
  }));
}

export async function executeRefinementAnswerNow(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    refinementBatchId?: string;
    sourceMessageId?: string;
  }
): Promise<RefinementActionResult> {
  const parsed = refinementActionParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Invalid refinement action." };
  }

  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  const loaded = await loadRefinementSuggestions(supabase, params);

  if (loaded.suggestions.length === 0) {
    return {
      success: false,
      error: "No refinement suggestions available right now.",
    };
  }

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  const scopeIds = (scopes ?? []).map((s) => s.id);
  const { data: scopeQuestions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  const scopeGroups = buildScopeGroups(
    (scopes ?? []) as {
      id: string;
      name: string;
      scope_types: { name: string } | null;
    }[]
  ).map((group) => ({
    ...group,
    questions: (scopeQuestions ?? []).filter(
      (q) => q.project_scope_id === group.scopeId
    ),
  }));

  const questionLimit = Math.min(
    MAX_REFINEMENT_QUESTIONS,
    loaded.suggestions.length
  );

  const questions = suggestionsToPricingQuestions(
    loaded.suggestions,
    scopeGroups,
    scopeQuestions ?? [],
    questionLimit
  ).map((q) => refinementAnswerQuestionSchema.parse(q));

  if (questions.length === 0) {
    return {
      success: false,
      error:
        "I couldn't prepare answerable questions from those suggestions. Try adding your rates or answering in the chat.",
    };
  }

  let intro = buildRefinementBatchIntro(questions, loaded.scopeName);
  const displayedAnswerable = loaded.suggestions.filter(
    (s) =>
      s.factKey !== "contractor_rates" && !s.factKey.startsWith("trace_")
  );
  if (displayedAnswerable.length > MAX_REFINEMENT_QUESTIONS) {
    intro = `${intro}\n\nShowing the top ${MAX_REFINEMENT_QUESTIONS}.`;
  }

  if (loaded.sourceMessageId) {
    await updateAssistantMessageMetadata(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      messageId: loaded.sourceMessageId,
      patch: { actionTaken: "answer_now" },
    });
  }

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: intro,
    metadata: {
      messageType: "refinement_answer_batch",
      refinementBatchId: loaded.refinementBatchId,
      intro,
      questions,
    },
  });

  return {
    success: true,
    message: intro,
    estimateRecalculated: false,
  };
}

export async function executeRefinementSkip(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    refinementBatchId?: string;
    sourceMessageId?: string;
  }
): Promise<RefinementActionResult> {
  const loaded = await loadRefinementSuggestions(supabase, params);

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "user",
    content: "Skip for now.",
    metadata: {
      messageType: "refinement_skip",
      refinementBatchId: loaded.refinementBatchId,
    },
  });

  const ack =
    "No problem — I'll keep this as a rough estimate. You can refine it later.";

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: ack,
    metadata: {
      messageType: "refinement_skipped_ack",
      refinementBatchId: loaded.refinementBatchId,
      suggestionsFingerprint: loaded.suggestionsFingerprint,
    },
  });

  if (loaded.sourceMessageId) {
    await updateAssistantMessageMetadata(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      messageId: loaded.sourceMessageId,
      patch: {
        actionTaken: "skipped",
        refinementSkipped: true,
        suggestionsFingerprint: loaded.suggestionsFingerprint,
      },
    });
  }

  return {
    success: true,
    message: ack,
    estimateRecalculated: false,
  };
}

export type BenchmarkScopeChoice = {
  scopeTypeKey: string;
  label: string;
  workAreaTypeKey: string;
  unit: string;
  benchmarkLow: number;
  benchmarkStandard: number;
  benchmarkPremium: number;
};

export async function resolveRefinementRateScopes(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    refinementBatchId?: string;
    sourceMessageId?: string;
  }
): Promise<{
  scopes: BenchmarkScopeChoice[];
  singleScope: BenchmarkScopeChoice | null;
}> {
  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId
  );
  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);
  const benchmarkScopes = summary?.benchmarkScopesForOnboarding ?? [];

  if (benchmarkScopes.length === 1) {
    return { scopes: benchmarkScopes, singleScope: benchmarkScopes[0]! };
  }

  if (benchmarkScopes.length > 1) {
    return { scopes: benchmarkScopes, singleScope: null };
  }

  const loaded = await loadRefinementSuggestions(supabase, params);
  const scopeNames = [
    ...new Set(
      loaded.suggestions
        .map((s) => s.scopeName)
        .filter((name): name is string => Boolean(name))
    ),
  ];

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  const fallback: BenchmarkScopeChoice[] = (scopes ?? [])
    .filter((scope) =>
      scopeNames.length === 0
        ? true
        : scopeNames.some((name) =>
            scope.name.toLowerCase().includes(name.toLowerCase())
          )
    )
    .map((scope) => {
      const workAreaTypeKey = resolveWorkAreaTypeKey(
        scope.scope_types?.name ?? null,
        scope.name
      );
      return {
        scopeTypeKey: workAreaTypeKey.toLowerCase().replace(/\s+/g, "_"),
        label: scope.name,
        workAreaTypeKey,
        unit: "m²",
        benchmarkLow: 0,
        benchmarkStandard: 0,
        benchmarkPremium: 0,
      };
    });

  return {
    scopes: fallback,
    singleScope: fallback.length === 1 ? fallback[0]! : null,
  };
}

export async function executeRefinementAddRates(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    refinementBatchId?: string;
    sourceMessageId?: string;
  }
): Promise<
  RefinementActionResult & {
    rateScopes?: BenchmarkScopeChoice[];
    singleRateScope?: BenchmarkScopeChoice | null;
    navigateTo?: string;
  }
> {
  const loaded = await loadRefinementSuggestions(supabase, params);
  const rateInfo = await resolveRefinementRateScopes(supabase, params);

  if (loaded.sourceMessageId) {
    await updateAssistantMessageMetadata(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      messageId: loaded.sourceMessageId,
      patch: { actionTaken: "add_rates" },
    });
  }

  if (rateInfo.scopes.length === 0) {
    const returnTo = `/projects/${params.projectId}`;
    return {
      success: true,
      message: "Opening rate setup…",
      navigateTo: `/rates?projectId=${params.projectId}&returnTo=${encodeURIComponent(returnTo)}`,
      rateScopes: [],
      singleRateScope: null,
    };
  }

  return {
    success: true,
    message:
      rateInfo.singleScope != null
        ? "Opening rate setup…"
        : "Which rate do you want to add?",
    rateScopes: rateInfo.scopes,
    singleRateScope: rateInfo.singleScope,
  };
}

export async function executeRefinementAddMoreDetail(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    scopeId?: string;
  }
): Promise<RefinementActionResult> {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      scopeId: z.string().uuid().optional(),
    })
    .safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Invalid add-more-detail request." };
  }

  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId
  );
  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

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

  let missingItems = getCurrentMissingItems({
    workAreas,
    estimateTrace: summary?.estimateTrace,
  });

  if (params.scopeId) {
    missingItems = missingItems.filter((item) => item.scopeId === params.scopeId);
  }

  const eligible = [
    ...getCriticalOrUsefulMissing(missingItems),
    ...getOptionalMissing(missingItems),
  ].slice(0, MAX_REFINEMENT_QUESTIONS);

  if (eligible.length === 0) {
    return {
      success: false,
      error: "No optional details left to add right now.",
    };
  }

  const suggestions: ScopeRefinementSuggestion[] = eligible.map((item) => {
    const scope = getScopeByWorkAreaType(
      workAreas.find((a) => a.scopeId === item.scopeId)?.workAreaTypeKey ?? ""
    );
    const fact =
      scope?.requiredFacts.find((f) => f.key === item.factKey) ??
      scope?.optionalFacts.find((f) => f.key === item.factKey);

    return scopeRefinementSuggestionSchema.parse({
      factKey: item.factKey,
      label: item.label,
      question: fact?.questionText
        ? `For ${item.scopeLabel}, ${fact.questionText.charAt(0).toLowerCase()}${fact.questionText.slice(1)}`
        : item.label.replace(/ not confirmed$/, "?"),
      reason: "would improve estimate accuracy",
      impact:
        item.importance === "critical"
          ? "high"
          : item.importance === "useful"
            ? "medium"
            : "low",
      answerOptions: fact?.options?.map((o) => ({
        value: o.value,
        label: o.label,
      })),
      affectsEstimate: item.affectsEstimate,
      scopeId: item.scopeId,
      scopeName: item.scopeLabel,
      required: item.importance === "critical",
    });
  });

  const refinementBatchId = createRefinementBatchId();

  const scopeGroups = buildScopeGroups(
    (scopes ?? []) as {
      id: string;
      name: string;
      scope_types: { name: string } | null;
    }[]
  ).map((group) => ({
    ...group,
    questions: (scopeQuestions ?? []).filter(
      (q) => q.project_scope_id === group.scopeId
    ),
  }));

  const questions = suggestionsToPricingQuestions(
    suggestions,
    scopeGroups,
    scopeQuestions ?? [],
    MAX_REFINEMENT_QUESTIONS
  ).map((q) => refinementAnswerQuestionSchema.parse(q));

  if (questions.length === 0) {
    return {
      success: false,
      error: "Could not prepare questions for optional details.",
    };
  }

  const intro = "Add a few more details to sharpen this estimate.";

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: intro,
    metadata: {
      messageType: "refinement_answer_batch",
      refinementBatchId,
      intro,
      questions,
      addMoreDetail: true,
    },
  });

  return {
    success: true,
    message: intro,
    estimateRecalculated: false,
  };
}
