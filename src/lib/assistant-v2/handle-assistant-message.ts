import { routeAssistantCommand } from "@/lib/assistant-v2/commands/route-assistant-command";
import { buildCommandEcho, isActionIntent } from "@/lib/assistant-v2/build-command-echo";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";

import {

  classifyAssistantIntent,

  shouldRunDiscovery,

} from "@/lib/assistant-v2/intent/classify-assistant-intent";

import {

  CONFIDENCE_EXECUTE_THRESHOLD,
  CONFIDENCE_CONFIRM_THRESHOLD,

  FALLBACK_ACTION_OPTIONS,

  type AssistantIntent,

  type AssistantIntentPayload,

  type ClassifiedAssistantIntent,

  type PendingAssistantCommand,

  type UpdateAllowancePayload,

} from "@/lib/assistant-v2/intent/types";

import {
  buildDiscoveryAssistantText,
  loadAssistantProjectContext,
  shouldEnterDiscoveryMode,
} from "@/lib/assistant-v2/discovery-mode";
import { loadScopeFactContext } from "@/lib/assistant-v2/facts/scope-context";
import { resolveEstimateItem } from "@/lib/assistant-v2/item-resolution/resolve-estimate-item";

import { runAssistantAnalysis } from "@/lib/assistant-v2/run-assistant-analysis";

import { submitProjectNotes } from "@/lib/assistant-v2/submit-notes";

import { timedOperation } from "@/lib/assistant-v2/timed-operation";

import { isTimeoutError, withTimeout } from "@/lib/ai/with-timeout";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";



type Supabase = SupabaseClient<Database>;



const DISCOVERY_TIMEOUT_MS = 15000;

const CLASSIFICATION_TIMEOUT_MS = 8000;



export type HandleAssistantMessageResult = {

  success: boolean;

  message: string;

  error?: string;

  intent?: AssistantIntent;

  requiresConfirmation?: boolean;

  usedDiscovery?: boolean;

  estimateRecalculated?: boolean;

  openBreakdown?: boolean;

  usedFallback?: boolean;

  analysingMode?: "ai" | "rules";

};



async function executeDiscoveryFlow(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    userId: string;

    content: string;

  }

): Promise<HandleAssistantMessageResult> {

  const saveResult = await submitProjectNotes(supabase, {

    organisationId: params.organisationId,

    projectId: params.projectId,

    userId: params.userId,

    content: params.content,

  });



  if ("error" in saveResult && saveResult.error) {

    return { success: false, message: "", error: saveResult.error };

  }



  let analyseResult: Awaited<ReturnType<typeof runAssistantAnalysis>>;



  try {

    analyseResult = await timedOperation("runAssistantAnalysis", () =>

      withTimeout(

        runAssistantAnalysis(supabase, {

          organisationId: params.organisationId,

          projectId: params.projectId,

          userId: params.userId,

        }),

        DISCOVERY_TIMEOUT_MS,

        "AI discovery"

      )

    );

  } catch (error) {

    if (isTimeoutError(error)) {

      analyseResult = await runAssistantAnalysis(supabase, {

        organisationId: params.organisationId,

        projectId: params.projectId,

        userId: params.userId,

        forceRules: true,

      });

    } else {

      throw error;

    }

  }



  const { data: pendingSuggestions } = await supabase

    .from("project_scope_suggestions")

    .select("suggested_name, confidence")

    .eq("project_id", params.projectId)

    .eq("organisation_id", params.organisationId)

    .eq("status", "pending");



  const { data: needsClarification } = await supabase

    .from("assistant_messages")

    .select("id")

    .eq("project_id", params.projectId)

    .eq("organisation_id", params.organisationId)

    .contains("metadata", { messageType: "internal_works_clarification" })

    .order("created_at", { ascending: false })

    .limit(1)

    .maybeSingle();



  const finalAssistantText = buildDiscoveryAssistantText({

    pendingSuggestions: pendingSuggestions ?? [],

    analyseSuccess: analyseResult.success,

    usedFallback: analyseResult.usedFallback,

    needsClarification: Boolean(needsClarification),

  });



  await insertAssistantMessage(supabase, {

    organisationId: params.organisationId,

    projectId: params.projectId,

    userId: params.userId,

    role: "assistant",

    content: finalAssistantText,

    metadata: {

      messageType: "assistant_text",

      analysingMode: analyseResult.analysingMode,

      discoveryMode: true,

    },

  });



  return {

    success: true,

    message: finalAssistantText,

    intent: "new_scope_notes",

    usedDiscovery: true,

    estimateRecalculated: analyseResult.success,

    analysingMode: analyseResult.analysingMode,

    usedFallback: analyseResult.usedFallback,

  };

}



function parseAmountFromPayload(payload: AssistantIntentPayload | null): number | null {

  if (!payload || !("amount" in payload)) return null;

  const amount = (payload as UpdateAllowancePayload).amount;

  return typeof amount === "number" && amount > 0 ? amount : null;

}



async function applyItemResolution(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    content: string;

    classification: ClassifiedAssistantIntent;

  }

): Promise<ClassifiedAssistantIntent> {

  const { classification, content } = params;



  if (

    classification.intent !== "update_allowance" &&

    classification.intent !== "remove_allowance"

  ) {

    return classification;

  }



  const commandIntent =

    classification.intent === "remove_allowance" ? "remove" : "update";



  const resolution = await resolveEstimateItem(supabase, {

    projectId: params.projectId,

    organisationId: params.organisationId,

    userCommand: content,

    candidateType: "allowance",

    commandIntent,

    targetAmount: parseAmountFromPayload(classification.extractedPayload),

  });



  if (classification.intent === "remove_allowance") {

    if (resolution.confidence >= CONFIDENCE_EXECUTE_THRESHOLD && resolution.itemKey) {

      return {

        ...classification,

        confidence: resolution.confidence,

        extractedPayload: {

          allowanceKey: resolution.itemKey,

          label: resolution.label ?? resolution.itemKey,

        },

        requiresConfirmation: resolution.suggestedAction === "confirm",

        confirmationMessage:

          resolution.suggestedAction === "confirm"

            ? `I found an existing ${resolution.label?.toLowerCase() ?? "allowance"}. Do you want me to remove it from this estimate?`

            : undefined,

        confirmationOptions:

          resolution.suggestedAction === "confirm"

            ? [

                { id: "confirm", label: "Yes, remove it" },

                { id: "ignore", label: "No, ignore" },

              ]

            : undefined,

      };

    }



    if (resolution.confidence >= 0.5 && resolution.confidence < CONFIDENCE_EXECUTE_THRESHOLD) {

      return {

        ...classification,

        confidence: resolution.confidence,

        extractedPayload: resolution.itemKey

          ? {

              allowanceKey: resolution.itemKey,

              label: resolution.label ?? resolution.itemKey,

            }

          : null,

        requiresConfirmation: true,

        confirmationMessage: `I found an existing ${resolution.label?.toLowerCase() ?? "allowance"}. Do you want me to remove it from this estimate?`,

        confirmationOptions: [

          { id: "confirm", label: "Yes, remove it" },

          { id: "ignore", label: "No, ignore" },

        ],

      };

    }



    return {

      ...classification,

      confidence: resolution.confidence,

      requiresConfirmation: true,

      confirmationMessage:

        resolution.reason ||

        "Which allowance should I remove from this estimate?",

    };

  }



  // update_allowance

  const payload = classification.extractedPayload as UpdateAllowancePayload | null;

  const allowanceKey = resolution.itemKey ?? payload?.allowanceKey;

  const label = resolution.label ?? payload?.label ?? "allowance";

  const amount = payload?.amount ?? parseAmountFromPayload(classification.extractedPayload);



  if (!allowanceKey || !amount || amount <= 0) {

    return classification;

  }



  const updatedPayload: UpdateAllowancePayload = {

    allowanceKey,

    label,

    amount,

    previousAmount: resolution.currentAmount ?? payload?.previousAmount ?? null,

  };



  if (resolution.suggestedAction === "update" && resolution.confidence >= CONFIDENCE_EXECUTE_THRESHOLD) {

    return {

      ...classification,

      confidence: resolution.confidence,

      extractedPayload: updatedPayload,

      requiresConfirmation: false,

    };

  }



  if (resolution.suggestedAction === "confirm") {

    const currentText =

      resolution.currentAmount != null

        ? `$${resolution.currentAmount.toLocaleString("en-NZ")}`

        : "an existing value";

    const targetText = `$${amount.toLocaleString("en-NZ")}`;



    return {

      ...classification,

      confidence: resolution.confidence,

      extractedPayload: updatedPayload,

      requiresConfirmation: true,

      confirmationMessage:

        resolution.matched

          ? `I found an existing ${label} allowance of ${currentText}. Do you want me to update it to ${targetText}?`

          : `I couldn't find an existing allowance. Do you want me to add ${label} for ${targetText}?`,

      confirmationOptions: resolution.matched

        ? [

            { id: "confirm", label: "Yes, update it" },

            { id: "ignore", label: "No, ignore" },

          ]

        : [

            { id: "confirm", label: "Yes, add allowance" },

            { id: "ignore", label: "No, ignore" },

          ],

    };

  }



  if (resolution.suggestedAction === "add") {

    return {

      ...classification,

      confidence: Math.max(classification.confidence, 0.75),

      extractedPayload: updatedPayload,

      requiresConfirmation: true,

      confirmationMessage: `I couldn't find an existing allowance. Do you want me to add ${label} for $${amount.toLocaleString("en-NZ")}?`,

      confirmationOptions: [

        { id: "confirm", label: "Yes, add allowance" },

        { id: "ignore", label: "No, ignore" },

      ],

    };

  }



  return {

    ...classification,

    extractedPayload: updatedPayload,

  };

}



async function insertConfirmationMessage(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    userId: string;

    classification: ClassifiedAssistantIntent;

  }

): Promise<HandleAssistantMessageResult> {

  const pendingCommand: PendingAssistantCommand = {

    intent: params.classification.intent,

    confidence: params.classification.confidence,

    extractedPayload: params.classification.extractedPayload ?? {},

    requiresConfirmation: true,

  };



  await insertAssistantMessage(supabase, {

    organisationId: params.organisationId,

    projectId: params.projectId,

    userId: params.userId,

    role: "assistant",

    content:

      params.classification.confirmationMessage ??

      "Just checking — should I go ahead with that?",

    metadata: {

      messageType: "command_confirmation",

      responseType:

        params.classification.confidence < CONFIDENCE_CONFIRM_THRESHOLD

          ? "clarification_required"

          : "confirmation_required",

      intent: params.classification.intent,

      confidence: params.classification.confidence,

      extractedPayload: params.classification.extractedPayload,

      requiresConfirmation: true,

      pendingCommand,

      confirmationOptions:

        params.classification.confirmationOptions ?? [

          { id: "confirm", label: "Yes, update it" },

          { id: "ignore", label: "No, ignore" },

        ],

    },

  });



  return {

    success: true,

    message:

      params.classification.confirmationMessage ??

      "Please confirm before I make changes.",

    intent: params.classification.intent,

    requiresConfirmation: true,

  };

}



async function insertFallbackMessage(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    userId: string;

  }

): Promise<HandleAssistantMessageResult> {

  const message =

    "I couldn't confidently process that. Do you want to update an allowance, add a work area, or ask a question?";



  await insertAssistantMessage(supabase, {

    organisationId: params.organisationId,

    projectId: params.projectId,

    userId: params.userId,

    role: "assistant",

    content: message,

    metadata: {

      messageType: "fallback_options",

      fallbackOptions: FALLBACK_ACTION_OPTIONS,

    },

  });



  return {

    success: true,

    message,

    usedFallback: true,

    intent: "unknown",

  };

}



export async function executeAssistantCommand(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    intent: AssistantIntent;
    payload: AssistantIntentPayload | null;
  }
): Promise<HandleAssistantMessageResult> {
  return routeAssistantCommand(supabase, params);
}



export async function handleAssistantMessage(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    userId: string;

    content: string;

  }

): Promise<HandleAssistantMessageResult> {

  const context = await loadAssistantProjectContext(

    supabase,

    params.organisationId,

    params.projectId

  );



  if (shouldEnterDiscoveryMode(context)) {

    return executeDiscoveryFlow(supabase, params);

  }



  let classification: ClassifiedAssistantIntent;

  const scopeFactContext = await loadScopeFactContext(
    supabase,
    params.organisationId,
    params.projectId
  );

  try {

    classification = await timedOperation("classifyAssistantIntent", () =>

      withTimeout(

        classifyAssistantIntent(params.content, {
          workAreaNames: context.workAreaNames,
          existingAllowanceKeys: context.existingAllowanceKeys,
          qualityLevel: context.qualityLevel,
          hasConfirmedScopes: context.confirmedWorkAreaCount > 0,
          scopes: scopeFactContext,
        }),

        CLASSIFICATION_TIMEOUT_MS,

        "Intent classification"

      )

    );

  } catch (error) {

    if (isTimeoutError(error)) {

      return insertFallbackMessage(supabase, params);

    }

    throw error;

  }



  classification = await applyItemResolution(supabase, {

    ...params,

    classification,

  });



  if (

    classification.requiresConfirmation ||

    classification.confidence < CONFIDENCE_EXECUTE_THRESHOLD

  ) {

    if (classification.intent === "unknown") {

      return insertFallbackMessage(supabase, params);

    }

    return insertConfirmationMessage(supabase, { ...params, classification });

  }



  if (shouldRunDiscovery(classification.intent)) {

    return executeDiscoveryFlow(supabase, params);

  }



  const echoText =

    classification.commandEcho ?? buildCommandEcho(classification);

  if (echoText && isActionIntent(classification.intent)) {

    await insertAssistantMessage(supabase, {

      organisationId: params.organisationId,

      projectId: params.projectId,

      userId: params.userId,

      role: "assistant",

      content: echoText,

      metadata: {

        messageType: "assistant_text",

        responseType: "command_echo",

        intent: classification.intent,

      },

    });

  }



  const commandResult = await timedOperation("executeAssistantCommand", () =>

    executeAssistantCommand(supabase, {

      organisationId: params.organisationId,

      projectId: params.projectId,

      userId: params.userId,

      intent: classification.intent,

      payload: classification.extractedPayload,

    })

  );



  return {

    ...commandResult,

    intent: classification.intent,

  };

}



export async function confirmPendingAssistantCommand(

  supabase: Supabase,

  params: {

    organisationId: string;

    projectId: string;

    userId: string;

    pendingCommand: PendingAssistantCommand;

    confirmed: boolean;

  }

): Promise<HandleAssistantMessageResult> {

  if (!params.confirmed) {

    await insertAssistantMessage(supabase, {

      organisationId: params.organisationId,

      projectId: params.projectId,

      userId: params.userId,

      role: "assistant",

      content: "No problem — I won't make any changes.",

      metadata: { messageType: "assistant_text" },

    });

    return { success: true, message: "Command ignored." };

  }



  return executeAssistantCommand(supabase, {

    organisationId: params.organisationId,

    projectId: params.projectId,

    userId: params.userId,

    intent: params.pendingCommand.intent,

    payload: params.pendingCommand.extractedPayload,

  });

}

