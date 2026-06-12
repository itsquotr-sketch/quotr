import { getLatestDiscoveryRun, parseDiscoveryRun } from "@/lib/discovery-data";
import type { DiscoveryFact } from "@/lib/ai/discovery/types";
import {
  findQuestionDefByKey,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { factValueToAnswer } from "@/lib/scope-answer-prefill";
import { parseScopeAnswer } from "@/lib/scope-answer-format";
import { persistScopeAnswer } from "@/lib/scope-answers-persist";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function factsForScope(
  facts: DiscoveryFact[],
  workAreaTypeKey: string
): DiscoveryFact[] {
  return facts.filter(
    (f) => !f.workAreaTypeKey || f.workAreaTypeKey === workAreaTypeKey
  );
}

/**
 * Syncs discovery facts into scope_answers for a project.
 * Does not overwrite answers the user has already provided.
 */
export async function syncDiscoveryFactsToScopeAnswers(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ synced: number; error: string | null }> {
  const { data: latestRun } = await getLatestDiscoveryRun(
    supabase,
    organisationId,
    projectId
  );
  const discovery = parseDiscoveryRun(latestRun ?? null);
  if (!discovery?.facts?.length) {
    return { synced: 0, error: null };
  }

  const { data: scopes, error: scopesError } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (scopesError) {
    logSupabaseError("syncDiscoveryFactsToScopeAnswers.scopes", scopesError);
    return { synced: 0, error: scopesError.message };
  }

  let synced = 0;

  for (const scope of scopes ?? []) {
    const typeKey = resolveWorkAreaTypeKey(
      (scope.scope_types as { name: string } | null)?.name,
      scope.name
    );
    const relevantFacts = factsForScope(discovery.facts, typeKey);
    if (relevantFacts.length === 0) continue;

    const { data: questions, error: questionsError } = await supabase
      .from("scope_questions")
      .select("id, question_key, unit")
      .eq("project_scope_id", scope.id);

    if (questionsError) {
      logSupabaseError(
        "syncDiscoveryFactsToScopeAnswers.questions",
        questionsError
      );
      return { synced, error: questionsError.message };
    }

    if (!questions?.length) continue;

    for (const fact of relevantFacts) {
      const questionKey = normalizeQuestionKey(fact.key);
      if (!questionKey) continue;

      const question = questions.find(
        (q) => normalizeQuestionKey(q.question_key) === questionKey
      );
      if (!question) continue;

      const { data: existingRows } = await supabase
        .from("scope_answers")
        .select("id, answer, source")
        .eq("scope_question_id", question.id)
        .order("created_at", { ascending: true });

      const existing = existingRows?.[0];
      const parsed = parseScopeAnswer(existing?.answer, existing?.source);

      if (parsed?.source === "user" && parsed.value.trim()) {
        continue;
      }

      const def = findQuestionDefByKey(questionKey, typeKey);
      const answerValue = factValueToAnswer(questionKey, fact.value, typeKey);
      const unit = fact.unit ?? def?.unit ?? question.unit ?? undefined;

      const error = await persistScopeAnswer(supabase, {
        organisationId,
        scopeQuestionId: question.id,
        projectScopeId: scope.id,
        answer: answerValue,
        source: "discovery",
        unit,
      });

      if (error) {
        logSupabaseError("syncDiscoveryFactsToScopeAnswers.persist", error);
        return { synced, error: error.message };
      }

      synced++;
    }
  }

  return { synced, error: null };
}
