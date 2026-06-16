import { devLog } from "@/lib/dev-log";
import type { ScopeQuestionForMissing } from "@/lib/cost-engine/build-missing-information";
import { parseDiscoveryRun, getLatestDiscoveryRun } from "@/lib/discovery-data";
import { DEFAULT_TARGET_MARGIN_PERCENT } from "@/lib/constants/quick-estimate";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import {
  getConstraintBySlug,
  getRelevantConstraints,
} from "@/lib/project-assistant-constraints";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { deriveConstraintsFromAnswers } from "@/lib/cost-engine/derive-constraints-from-answers";
import {
  buildAnswersMap,
  type QuickEstimateInput,
} from "@/lib/cost-engine/quick-estimate-input";
import {
  loadPricingContext,
  type PricingContext,
} from "@/lib/cost-engine/cache/load-pricing-context";
import { parseScopeEstimateCache } from "@/lib/cost-engine/cache/scope-estimate-cache";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { listScopeBuilderInputs } from "@/lib/scope-builder-data";
import { listProjectAllowances } from "@/lib/assistant-v2/project-allowances-data";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { getProjectById } from "@/lib/projects-data";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { factValueToAnswer } from "@/lib/scope-answer-prefill";
import { isAnswered, type AnswerInputType } from "@/lib/scope-answer-state";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function parseSelectOptions(
  options: unknown
): { value: string; label: string }[] {
  if (!options || !Array.isArray(options)) return [];
  return (options as { value: string; label: string }[]).filter(
    (o) => o.value && o.label
  );
}

export async function buildQuickEstimateInput(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  options?: { pricingContext?: PricingContext; forceRefreshRates?: boolean }
): Promise<{ input: QuickEstimateInput | null; error: string | null }> {
  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return { input: null, error: "Project not found." };
  }

  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  if (!quickEstimate) {
    return { input: null, error: "Quick estimate not found." };
  }

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, include_in_quick_estimate, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  const allScopes = scopes ?? [];
  const includedScopes = allScopes.filter(
    (s) => s.include_in_quick_estimate !== false
  );
  const excludedWorkAreaNames = allScopes
    .filter((s) => s.include_in_quick_estimate === false)
    .map((s) => s.name);
  const allWorkAreasExcluded =
    allScopes.length > 0 && includedScopes.length === 0;

  const scopeIds = allScopes.map((s) => s.id);
  const { data: questions, error: questionsError } =
    await listScopeQuestionsForProject(supabase, scopeIds);

  if (questionsError) {
    return { input: null, error: "Could not load scope questions." };
  }

  const [pricingContext, { data: discoveryRun }, { data: scopeBuilderInputs }, { data: userAllowances }] =
    await Promise.all([
      options?.pricingContext ??
        loadPricingContext(supabase, organisationId, {
          forceRefresh: options?.forceRefreshRates,
        }),
      getLatestDiscoveryRun(supabase, organisationId, projectId),
      listScopeBuilderInputs(supabase, organisationId, projectId),
      listProjectAllowances(supabase, organisationId, projectId),
    ]);

  const {
    scopeRates,
    packageRates,
    labourRates,
    materialRates,
    subcontractorRates,
    pricingSettings,
  } = pricingContext;

  const sourceNotesLength = (scopeBuilderInputs ?? [])
    .map((i) => i.content.trim())
    .join(" ").length;

  const discovery = parseDiscoveryRun(discoveryRun ?? null);

  const answeredQuestionKeys = new Set<string>();
  let questionsAnswered = 0;
  const scopeQuestionsForMissing: ScopeQuestionForMissing[] = [];

  const workAreas = includedScopes.map((s) => {
    const workAreaTypeKey = resolveWorkAreaTypeKey(
      (s.scope_types as { name: string } | null)?.name,
      s.name
    );
    const scopeQuestions = (questions ?? []).filter(
      (q) => q.project_scope_id === s.id
    );
    const { answers, fromNotes } = buildAnswersMap(scopeQuestions);

    // Saved answers win — only fill gaps from discovery facts
    if (discovery?.facts?.length) {
      for (const q of scopeQuestions) {
        const key = normalizeQuestionKey(q.question_key);
        if (!key) continue;

        const row = q.scope_answers?.[0];
        if (
          isAnswered(row?.answer ?? null, row?.source, {
            inputType: (q.question_type as AnswerInputType) ?? "text",
            requiresPositiveNumber: q.question_type === "number",
          })
        ) {
          continue;
        }

        const fact = discovery.facts.find((f) => {
          const factKey = normalizeQuestionKey(f.key);
          if (factKey !== key) return false;
          return !f.workAreaTypeKey || f.workAreaTypeKey === workAreaTypeKey;
        });

        if (fact) {
          answers[key] = factValueToAnswer(key, fact.value, workAreaTypeKey);
          fromNotes.push(key);
        }
      }
    }

    for (const q of scopeQuestions) {
      const key = normalizeQuestionKey(q.question_key);
      const row = q.scope_answers?.[0];
      const def = resolveQuestionDef(q, workAreaTypeKey);
      const inputType =
        (q.question_type as AnswerInputType) ?? def?.inputType ?? "text";
      const options =
        parseSelectOptions(q.options).length > 0
          ? parseSelectOptions(q.options)
          : (def?.options ?? []);

      scopeQuestionsForMissing.push({
        questionKey: key,
        questionText: q.question,
        workAreaTypeKey,
        workAreaName: s.name,
        answerRaw: row?.answer ?? null,
        answerSource: row?.source ?? null,
        inputType,
        options,
      });

      const answered = isAnswered(row?.answer ?? null, row?.source, {
        inputType,
        requiresPositiveNumber: inputType === "number",
        allowedValues:
          inputType === "select" && options.length > 0
            ? options.map((o) => o.value)
            : undefined,
      });

      if (answered) {
        questionsAnswered++;
        if (key) answeredQuestionKeys.add(key);
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[dev:estimate.input.scopeFacts]", {
        scopeId: s.id,
        scopeName: s.name,
        workAreaTypeKey,
        answerKeys: Object.keys(answers),
        answers,
      });
    }

    return {
      scopeId: s.id,
      name: s.name,
      workAreaTypeKey,
      answers,
      answeredFromNotes: fromNotes,
    };
  });

  // Rebuild scope questions with merged answers reflected for missing calc
  const scopeQuestions = scopeQuestionsForMissing.map((q) => {
    const area = workAreas.find((w) => w.name === q.workAreaName);
    const key = q.questionKey;
    if (!area || !key) return q;
    const mergedAnswer = area.answers[key];
    if (!mergedAnswer) return q;
    if (isAnswered(q.answerRaw, q.answerSource)) return q;
    return {
      ...q,
      answerRaw: mergedAnswer,
      answerSource: area.answeredFromNotes.includes(key)
        ? "discovery"
        : q.answerSource,
    };
  });

  const workAreaTypeKeys = workAreas.map((w) => w.workAreaTypeKey);
  const allConstraints = getRelevantConstraints(
    workAreaTypeKeys,
    answeredQuestionKeys
  );

  const { data: constraintSelections } = await supabase
    .from("project_constraint_selections")
    .select("constraint_key, label, selected, metadata")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  const assessedSlugs = new Set(
    (constraintSelections ?? []).map((row) => row.constraint_key)
  );

  const savedConstraints = (constraintSelections ?? [])
    .filter((row) => row.selected === true)
    .map((row) => {
      const slug = row.constraint_key;
      const constraint =
        allConstraints.find((c) => c.slug === slug) ?? getConstraintBySlug(slug);
      const val = row.metadata as {
        metres?: number;
        description?: string;
        severity?: "low" | "typical" | "high";
      } | null;
      return {
        slug,
        label: row.label || constraint?.label || slug,
        metres: val?.metres,
        description: val?.description,
        severity: val?.severity,
      };
    });

  const siteConstraintsAssessed = assessedSlugs.size > 0;

  const mergedAnswers: Record<string, string> = {};
  for (const area of workAreas) {
    Object.assign(mergedAnswers, area.answers);
  }

  const constraints = deriveConstraintsFromAnswers(
    mergedAnswers,
    savedConstraints
  );

  devLog("constraints.cost-engine.input", {
    projectId,
    quickEstimateId: quickEstimate.id,
    constraints,
  });

  const targetMarginPercent = Number(
    quickEstimate.target_margin_percent ??
      pricingSettings?.default_margin_percent ??
      DEFAULT_TARGET_MARGIN_PERCENT
  );

  const contingencyPercent = Number(
    pricingSettings?.contingency_percent ?? 5
  );

  const previousSummary = parseQuickEstimateSummary(quickEstimate.notes ?? null);
  const scopeEstimateCache = parseScopeEstimateCache(
    previousSummary as Record<string, unknown> | null
  );

  return {
    input: {
      organisationId,
      project: {
        id: project.id,
        title: project.title,
      },
      quickEstimate: {
        id: quickEstimate.id,
        client_budget: quickEstimate.client_budget,
        target_margin_percent: quickEstimate.target_margin_percent,
        quality_level: quickEstimate.quality_level,
      },
      workAreas,
      constraints,
      scopeRates: scopeRates ?? [],
      packageRates: packageRates ?? [],
      labourRates: labourRates ?? [],
      materialRates: materialRates ?? [],
      subcontractorRates: subcontractorRates ?? [],
      targetMarginPercent,
      contingencyPercent,
      sourceNotesLength,
      discovery,
      questionsAnswered,
      questionsTotal: questions?.length ?? 0,
      answeredQuestionKeys,
      scopeQuestions,
      excludedWorkAreaNames,
      allWorkAreasExcluded,
      siteConstraintsAssessed,
      userAllowances: userAllowances ?? [],
      pricingContextVersion: pricingContext.version,
      scopeEstimateCache,
    },
    error: null,
  };
}
