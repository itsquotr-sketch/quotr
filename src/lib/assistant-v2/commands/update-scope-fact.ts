import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { UpdateScopeFactPayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { formatCurrencyRange } from "@/lib/format-currency";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function formatFactValue(
  value: string,
  factKey: string,
  unit?: string
): string {
  if (unit) return `${value}${unit}`;
  const scopeDef = getScopeByWorkAreaType(
    factKey.startsWith("deck.")
      ? "Deck"
      : factKey.startsWith("retaining_wall.")
        ? "Retaining Wall"
        : factKey.startsWith("bathroom.")
          ? "Bathroom renovation"
          : ""
  );
  const fact = scopeDef
    ? getAllFactsForScope(scopeDef).find((f) => f.key === factKey)
    : null;
  if (fact?.type === "select" && fact.options) {
    const opt = fact.options.find((o) => o.value === value);
    if (opt?.label) return opt.label;
  }
  if (factKey.includes("finish_level")) {
    const level = normaliseQualityLevel(value);
    return level === "premium"
      ? "premium"
      : level === "budget"
        ? "budget"
        : "standard";
  }
  return value;
}

function formatEstimateDelta(
  event: EstimateChangeEvent | null | undefined
): string {
  if (!event) return "";
  if (event.kind === "unchanged") return "";

  const prevMid = (event.previousLow + event.previousHigh) / 2;
  const newMid = (event.newLow + event.newHigh) / 2;
  const delta = Math.abs(newMid - prevMid);

  if (delta < 50) return " Estimate updated.";

  const formatted = `$${Math.round(delta).toLocaleString("en-NZ")}`;
  if (event.kind === "increased") {
    return ` Estimate increased by ${formatted}.`;
  }
  if (event.kind === "decreased") {
    return ` Estimate decreased by ${formatted}.`;
  }

  const from = formatCurrencyRange(event.previousLow, event.previousHigh);
  const to = formatCurrencyRange(event.newLow, event.newHigh);
  return ` Estimate updated: ${from} → ${to}.`;
}

export async function executeUpdateScopeFact(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: UpdateScopeFactPayload;
  }
): Promise<CommandResult> {
  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  const { data: question } = await supabase
    .from("scope_questions")
    .select("id, project_scope_id, question_key")
    .eq("project_scope_id", params.payload.scopeId)
    .eq("organisation_id", params.organisationId)
    .eq("question_key", params.payload.factKey)
    .maybeSingle();

  if (!question) {
    return {
      success: false,
      message: "",
      error: `I couldn't find the question for ${params.payload.factLabel.toLowerCase()}. Try editing the work area directly.`,
    };
  }

  const persistError = await persistScopeAnswersBatch(
    supabase,
    params.organisationId,
    [
      {
        scopeQuestionId: question.id,
        projectScopeId: question.project_scope_id,
        answer: params.payload.newValue,
      },
    ]
  );

  if (persistError) {
    logSupabaseError("executeUpdateScopeFact", persistError);
    return {
      success: false,
      message: "",
      error: "Could not save the updated value.",
    };
  }

  const recalc = await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    {
      triggerEvent: "answer_changed",
      changeReason: `${params.payload.scopeName} ${params.payload.factLabel.toLowerCase()} updated`,
    }
  );

  const previousFormatted = params.payload.previousValue
    ? formatFactValue(
        params.payload.previousValue,
        params.payload.factKey,
        params.payload.unit
      )
    : null;
  const newFormatted = formatFactValue(
    params.payload.newValue,
    params.payload.factKey,
    params.payload.unit
  );

  const scopeLabel = params.payload.scopeName.toLowerCase();
  const factLabel = params.payload.factLabel.toLowerCase();

  let message: string;
  if (previousFormatted && previousFormatted !== newFormatted) {
    message = `${params.payload.scopeName} ${params.payload.factLabel.toLowerCase()} changed from ${previousFormatted} to ${newFormatted}.${formatEstimateDelta(recalc.estimateChange)}`;
  } else {
    message = `Updated ${scopeLabel} ${factLabel} to ${newFormatted}.${formatEstimateDelta(recalc.estimateChange)}`;
  }

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: {
      messageType: "assistant_text",
      commandIntent: "update_existing_fact",
      scopeId: params.payload.scopeId,
      factKey: params.payload.factKey,
    },
  });

  return {
    success: true,
    message,
    estimateRecalculated: true,
  };
}
