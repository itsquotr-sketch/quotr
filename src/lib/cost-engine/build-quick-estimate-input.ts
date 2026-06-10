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
import {
  buildAnswersMap,
  type QuickEstimateInput,
} from "@/lib/cost-engine/quick-estimate-input";
import {
  getOrganisationPricingSettings,
  listPackageRates,
} from "@/lib/rates-data";
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
  projectId: string
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
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  const scopeIds = (scopes ?? []).map((s) => s.id);
  const { data: questions, error: questionsError } =
    await listScopeQuestionsForProject(supabase, scopeIds);

  if (questionsError) {
    return { input: null, error: "Could not load scope questions." };
  }

  const [{ data: packageRates }, { data: pricingSettings }, { data: discoveryRun }] =
    await Promise.all([
      listPackageRates(supabase, organisationId),
      getOrganisationPricingSettings(supabase, organisationId),
      getLatestDiscoveryRun(supabase, organisationId, projectId),
    ]);

  const discovery = parseDiscoveryRun(discoveryRun ?? null);

  const answeredQuestionKeys = new Set<string>();
  let questionsAnswered = 0;
  const scopeQuestionsForMissing: ScopeQuestionForMissing[] = [];

  const workAreas = (scopes ?? []).map((s) => {
    const workAreaTypeKey = resolveWorkAreaTypeKey(
      (s.scope_types as { name: string } | null)?.name,
      s.name
    );
    const scopeQuestions = (questions ?? []).filter(
      (q) => q.project_scope_id === s.id
    );
    const { answers, fromNotes } = buildAnswersMap(scopeQuestions);

    // Saved answers win — only fill gaps from discovery facts
    if (discovery?.facts.length) {
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

  const { data: driverValues } = await supabase
    .from("project_estimate_driver_values")
    .select("constraint_key, value")
    .eq("quick_estimate_id", quickEstimate.id)
    .eq("organisation_id", organisationId);

  const constraints = (driverValues ?? [])
    .filter((v) => v.constraint_key)
    .map((v) => {
      const slug = v.constraint_key as string;
      const constraint =
        allConstraints.find((c) => c.slug === slug) ?? getConstraintBySlug(slug);
      const val = v.value as {
        metres?: number;
        description?: string;
        severity?: "low" | "typical" | "high";
      } | null;
      return {
        slug,
        label: constraint?.label ?? slug,
        metres: val?.metres,
        description: val?.description,
        severity: val?.severity,
      };
    });

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

  return {
    input: {
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
      packageRates: packageRates ?? [],
      targetMarginPercent,
      discovery,
      questionsAnswered,
      questionsTotal: questions?.length ?? 0,
      answeredQuestionKeys,
      scopeQuestions,
    },
    error: null,
  };
}
