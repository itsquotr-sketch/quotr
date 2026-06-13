import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { AskQuestionPayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function formatBreakdownResponse(
  summary: ReturnType<typeof parseQuickEstimateSummary>
): string {
  if (!summary?.costBreakdown) {
    return "There isn't a detailed breakdown yet — confirm work areas and answer key questions first.";
  }

  const breakdown = summary.costBreakdown;
  const lines = [
    "Here's your rough cost breakdown:",
    "",
    `• Labour: $${breakdown.labour.toLocaleString("en-NZ")}`,
    `• Materials: $${breakdown.materials.toLocaleString("en-NZ")}`,
    `• Subcontractors: $${breakdown.subcontractors.toLocaleString("en-NZ")}`,
    `• Allowances: $${breakdown.allowances.toLocaleString("en-NZ")}`,
    `• Contingency: $${breakdown.contingency.toLocaleString("en-NZ")}`,
  ];

  if (breakdown.byWorkArea.length > 0) {
    lines.push("", "By work area:");
    for (const area of breakdown.byWorkArea) {
      lines.push(`• ${area.name}: $${area.total.toLocaleString("en-NZ")}`);
    }
  }

  lines.push("", "See the breakdown panel on the right for more detail.");
  return lines.join("\n");
}

function formatWhatsIncludedResponse(
  scopes: { name: string; included: boolean }[],
  summary: ReturnType<typeof parseQuickEstimateSummary>,
  constraints: string[],
  allowances: string[]
): string {
  const included = scopes.filter((s) => s.included).map((s) => s.name);
  const excluded = scopes.filter((s) => !s.included).map((s) => s.name);

  const lines = ["Here's what's in this estimate:", ""];

  if (included.length > 0) {
    lines.push("Work areas:");
    for (const name of included) {
      lines.push(`• ${name}`);
    }
  } else {
    lines.push("No work areas confirmed yet.");
  }

  if (summary?.qualityLevel && summary.qualityLevel !== "unknown") {
    lines.push("", `Finish level: ${summary.qualityLevelNote ?? summary.qualityLevel}`);
  }

  if (constraints.length > 0) {
    lines.push("", "Site conditions:");
    for (const c of constraints) {
      lines.push(`• ${c}`);
    }
  }

  if (allowances.length > 0) {
    lines.push("", "Allowances:");
    for (const a of allowances) {
      lines.push(`• ${a}`);
    }
  }

  if (excluded.length > 0) {
    lines.push("", "Not included:");
    for (const name of excluded) {
      lines.push(`• ${name}`);
    }
  }

  if (summary?.assumptions?.length) {
    lines.push("", "Key assumptions:");
    for (const assumption of summary.assumptions.slice(0, 4)) {
      lines.push(`• ${assumption}`);
    }
  }

  return lines.join("\n");
}

export async function executeAskQuestion(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: AskQuestionPayload;
  }
): Promise<CommandResult & { openBreakdown?: boolean }> {
  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId
  );

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("name, include_in_quick_estimate")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  const scopeRows = (scopes ?? []).map((s) => ({
    name: s.name,
    included: s.include_in_quick_estimate !== false,
  }));

  let message: string;
  let openBreakdown = false;

  switch (params.payload.questionType) {
    case "breakdown":
      message = formatBreakdownResponse(summary);
      openBreakdown = true;
      break;
    case "whats_included":
      message = formatWhatsIncludedResponse(
        scopeRows,
        summary,
        summary?.constraintsApplied ?? [],
        summary?.allowances ?? []
      );
      break;
    case "sharpen_estimate":
      message =
        "Ask me what details would help — I'll list the most useful missing facts for this estimate.";
      break;
    case "internal_alteration": {
      message =
        "It usually means internal building changes, but it's too broad to price on its own. I need to break it into things like demolition, walls, ceilings, flooring, painting, electrical or plumbing.\n\nWhat internal works are involved?";
      await insertAssistantMessage(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        role: "assistant",
        content: message,
        metadata: {
          messageType: "internal_works_clarification",
          broadCategoryKey: "internal_alteration",
          projectScopeId: null,
          question: "Which of these apply?",
          options: [
            { key: "demolition", label: "Demolition" },
            { key: "partitions", label: "New partitions/walls" },
            { key: "ceiling_works", label: "Ceiling works" },
            { key: "flooring", label: "Flooring" },
            { key: "painting", label: "Painting" },
            { key: "electrical", label: "Electrical changes" },
            { key: "plumbing", label: "Plumbing changes" },
            { key: "joinery", label: "Joinery/cabinetry" },
            { key: "rubbish_removal", label: "Rubbish removal" },
            { key: "other", label: "Other" },
          ],
          detectedPackages: [],
        },
      });
      return { success: true, message, estimateRecalculated: false };
    }
    default: {
      message =
        "I can help with the estimate breakdown, what's included, or what details would sharpen the range. What would you like to know?";
    }
  }

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: {
      messageType: "assistant_text",
      commandIntent: "ask_question",
      questionType: params.payload.questionType,
      openBreakdown,
    },
  });

  return {
    success: true,
    message,
    estimateRecalculated: false,
    openBreakdown,
  };
}
