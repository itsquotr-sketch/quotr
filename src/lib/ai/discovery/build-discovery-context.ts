import type { DiscoveryRunContext } from "@/lib/ai/discovery/types";
import {
  getLatestDiscoveryRun,
  parseDiscoveryRun,
} from "@/lib/discovery-data";
import {
  listScopeQuestionsForProject,
  type ScopeQuestionWithAnswers,
} from "@/lib/project-assistant-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { readAnswerValue } from "@/lib/scope-answer-format";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function enrichDiscoveryContext(
  supabase: Supabase,
  organisationId: string,
  context: DiscoveryRunContext
): Promise<DiscoveryRunContext> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", context.projectId)
    .eq("organisation_id", organisationId);

  const confirmedWorkAreas =
    scopes?.map((scope) => {
      const typeName = scope.scope_types?.name ?? null;
      return {
        typeKey: resolveWorkAreaTypeKey(typeName, scope.name),
        name: scope.name,
      };
    }) ?? [];

  const scopeIds = (scopes ?? []).map((s) => s.id);
  const { data: questions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  const existingAnswers = buildExistingAnswers(questions ?? []);

  const { data: latestRun } = await getLatestDiscoveryRun(
    supabase,
    organisationId,
    context.projectId
  );
  const priorDiscovery = parseDiscoveryRun(latestRun ?? null);

  return {
    ...context,
    confirmedWorkAreas:
      confirmedWorkAreas.length > 0 ? confirmedWorkAreas : undefined,
    existingFacts: priorDiscovery?.facts,
    existingAnswers: existingAnswers.length > 0 ? existingAnswers : undefined,
  };
}

function buildExistingAnswers(questions: ScopeQuestionWithAnswers[]) {
  const answers: NonNullable<DiscoveryRunContext["existingAnswers"]> = [];

  for (const question of questions) {
    const row = question.scope_answers?.[0];
    const value = readAnswerValue(row?.answer, row?.source);
    if (!value.trim()) continue;

    const key =
      normalizeQuestionKey(question.question_key) ?? question.question_key;
    if (!key) continue;

    answers.push({
      key,
      value,
      source: row?.source ?? undefined,
    });
  }

  return answers;
}
