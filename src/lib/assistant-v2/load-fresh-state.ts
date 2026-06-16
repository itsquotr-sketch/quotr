import {
  loadAssistantEstimate,
  loadAssistantMessages,
  loadAssistantScopeQuestions,
} from "@/lib/assistant-v2/load-assistant-partial";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { QuickEstimate } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export interface FreshAssistantState {
  scopeQuestions: ScopeQuestionWithAnswers[];
  quickEstimate: QuickEstimate | null;
  messages: AssistantMessageRow[];
}

export async function loadFreshAssistantState(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    projectScopeId?: string;
  }
): Promise<FreshAssistantState> {
  const [scopeQuestions, quickEstimate, messages] = await Promise.all([
    loadAssistantScopeQuestions(
      supabase,
      params.organisationId,
      params.projectId
    ),
    loadAssistantEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      params.userId
    ),
    loadAssistantMessages(
      supabase,
      params.organisationId,
      params.projectId
    ),
  ]);

  return {
    scopeQuestions,
    quickEstimate,
    messages,
  };
}
