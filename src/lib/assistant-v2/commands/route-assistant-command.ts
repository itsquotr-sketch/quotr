import { executeAskQuestion } from "@/lib/assistant-v2/commands/answer-question";
import { executeAskRefinementQuestion } from "@/lib/assistant-v2/commands/execute-refinement-question";
import { executeRemoveAllowance } from "@/lib/assistant-v2/commands/remove-allowance";
import { executeUpdateConstraint } from "@/lib/assistant-v2/commands/update-constraint";
import { executeUpdateFinishLevel } from "@/lib/assistant-v2/commands/update-finish-level";
import { executeUpdateAllowance } from "@/lib/assistant-v2/commands/update-allowance";
import { executeUpdateScopeFact } from "@/lib/assistant-v2/commands/update-scope-fact";
import {
  executeAddWorkArea,
  executeExcludeWorkArea,
  executeIncludeWorkArea,
  executeOnlyIncludeWorkAreas,
} from "@/lib/assistant-v2/commands/work-area-commands";
import type { HandleAssistantMessageResult } from "@/lib/assistant-v2/handle-assistant-message";
import {
  type AssistantIntent,
  type AssistantIntentPayload,
  updateAllowancePayloadSchema,
  removeAllowancePayloadSchema,
  updateConstraintPayloadSchema,
  updateFinishLevelPayloadSchema,
  updateScopeFactPayloadSchema,
  workAreaCommandPayloadSchema,
  onlyIncludeWorkAreasPayloadSchema,
  askQuestionPayloadSchema,
  askRefinementPayloadSchema,
} from "@/lib/assistant-v2/intent/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type RouteAssistantCommandParams = {
  organisationId: string;
  projectId: string;
  userId: string;
  intent: AssistantIntent;
  payload: AssistantIntentPayload | null;
};

/**
 * Routes classified assistant intents to command handlers.
 * Every supported command must end in applied, confirmation, clarification, or a useful failure.
 */
export async function routeAssistantCommand(
  supabase: Supabase,
  params: RouteAssistantCommandParams
): Promise<HandleAssistantMessageResult> {
  switch (params.intent) {
    case "update_existing_fact": {
      const parsed = updateScopeFactPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error:
            "I couldn't apply that update. Which work area and detail should I change?",
          intent: "update_existing_fact",
        };
      }
      const result = await executeUpdateScopeFact(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "update_existing_fact" };
    }

    case "update_allowance": {
      const parsed = updateAllowancePayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid allowance command.",
          intent: "update_allowance",
        };
      }
      const result = await executeUpdateAllowance(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "update_allowance" };
    }

    case "remove_allowance": {
      const parsed = removeAllowancePayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid remove allowance command.",
          intent: "remove_allowance",
        };
      }
      const result = await executeRemoveAllowance(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "remove_allowance" };
    }

    case "update_finish_level": {
      const parsed = updateFinishLevelPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid finish level command.",
          intent: "update_finish_level",
        };
      }
      const result = await executeUpdateFinishLevel(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "update_finish_level" };
    }

    case "update_constraint": {
      const parsed = updateConstraintPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid constraint command.",
          intent: "update_constraint",
        };
      }
      const result = await executeUpdateConstraint(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "update_constraint" };
    }

    case "exclude_work_area":
    case "remove_work_area": {
      const parsed = workAreaCommandPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid work area command.",
          intent: params.intent,
        };
      }
      const result = await executeExcludeWorkArea(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: params.intent };
    }

    case "include_work_area": {
      const parsed = workAreaCommandPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid work area command.",
          intent: "include_work_area",
        };
      }
      const result = await executeIncludeWorkArea(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "include_work_area" };
    }

    case "add_work_area": {
      const parsed = workAreaCommandPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid work area command.",
          intent: "add_work_area",
        };
      }
      const result = await executeAddWorkArea(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "add_work_area" };
    }

    case "only_include_work_areas": {
      const parsed = onlyIncludeWorkAreasPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Which work area should I price?",
          intent: "only_include_work_areas",
        };
      }
      const result = await executeOnlyIncludeWorkAreas(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "only_include_work_areas" };
    }

    case "ask_question": {
      const parsed = askQuestionPayloadSchema.safeParse(params.payload);
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid question command.",
          intent: "ask_question",
        };
      }
      if (parsed.data.questionType === "sharpen_estimate") {
        const result = await executeAskRefinementQuestion(supabase, {
          organisationId: params.organisationId,
          projectId: params.projectId,
          userId: params.userId,
          payload: {},
        });
        return { ...result, intent: "ask_question" };
      }
      const result = await executeAskQuestion(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "ask_question" };
    }

    case "ask_refinement_question": {
      const parsed = askRefinementPayloadSchema.safeParse(params.payload ?? {});
      if (!parsed.success) {
        return {
          success: false,
          message: "",
          error: "Invalid refinement question command.",
          intent: "ask_refinement_question",
        };
      }
      const result = await executeAskRefinementQuestion(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        payload: parsed.data,
      });
      return { ...result, intent: "ask_refinement_question" };
    }

    default:
      return {
        success: false,
        message: "",
        error: "This command is not supported yet.",
        intent: params.intent,
      };
  }
}

/** @deprecated Use routeAssistantCommand */
export const executeAssistantCommand = routeAssistantCommand;
