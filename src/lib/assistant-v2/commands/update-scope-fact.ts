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

  const allUpdates = [
    {
      factKey: params.payload.factKey,
      factLabel: params.payload.factLabel,
      newValue: params.payload.newValue,
      previousValue: params.payload.previousValue,
      unit: params.payload.unit,
    },
    ...(params.payload.additionalFacts ?? []),
  ];

  const batchAnswers: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
  }[] = [];

  for (const update of allUpdates) {
    const { data: question } = await supabase
      .from("scope_questions")
      .select("id, project_scope_id, question_key")
      .eq("project_scope_id", params.payload.scopeId)
      .eq("organisation_id", params.organisationId)
      .eq("question_key", update.factKey)
      .maybeSingle();

    if (!question) {
      return {
        success: false,
        message: "",
        error: `I couldn't find the question for ${update.factLabel.toLowerCase()}. Try editing the work area directly.`,
      };
    }

    batchAnswers.push({
      scopeQuestionId: question.id,
      projectScopeId: question.project_scope_id,
      answer: update.newValue,
    });
  }

  const persistError = await persistScopeAnswersBatch(
    supabase,
    params.organisationId,
    batchAnswers
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
  const factKey = params.payload.factKey;
  const isClientSuppliedUpdate =
    factKey.includes("fixtures_client_supplied") ||
    factKey.includes("tiles_supplied") ||
    factKey.includes("material_supply") ||
    factKey.includes("balustrade_supply");

  if (isClientSuppliedUpdate) {
    const suppliedItems: string[] = [];
    const lowerAnswer = params.payload.newValue.toLowerCase();
    if (factKey.includes("tiles")) suppliedItems.push("tiles");
    if (factKey.includes("fixtures") || /vanity|toilet|basin/i.test(params.payload.newValue)) {
      if (/partial|yes|vanity|toilet/i.test(lowerAnswer)) {
        if (/vanity/i.test(params.payload.newValue) || factKey.includes("fixtures")) {
          suppliedItems.push("vanity");
        }
        if (/toilet/i.test(params.payload.newValue)) suppliedItems.push("toilet");
        if (/tile/i.test(params.payload.newValue)) suppliedItems.push("tiles");
      }
    }
    if (lowerAnswer === "labour_only" || lowerAnswer === "client_supplied") {
      message =
        "Got it — I've marked materials as client-supplied and removed those material allowances from the estimate.";
    } else if (suppliedItems.length > 0) {
      message = `Got it — I've marked ${suppliedItems.join(" and ")} as client-supplied and removed those material allowances from the estimate.${formatEstimateDelta(recalc.estimateChange)}`;
    } else {
      message = `Got it — I've updated client-supplied items and adjusted material allowances.${formatEstimateDelta(recalc.estimateChange)}`;
    }
  } else if (previousFormatted && previousFormatted !== newFormatted) {
    message = `Updated ${params.payload.scopeName} ${params.payload.factLabel.toLowerCase()} from ${previousFormatted} to ${newFormatted}.${formatEstimateDelta(recalc.estimateChange)}`;
  } else if ((params.payload.additionalFacts?.length ?? 0) > 0) {
    const extras = params.payload.additionalFacts!
      .map(
        (f) =>
          `${f.factLabel.toLowerCase()} to ${formatFactValue(f.newValue, f.factKey, f.unit)}`
      )
      .join(", ");
    message = `Updated ${scopeLabel} ${factLabel} to ${newFormatted} and ${extras}.${formatEstimateDelta(recalc.estimateChange)}`;
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
      responseType: "action_applied",
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
