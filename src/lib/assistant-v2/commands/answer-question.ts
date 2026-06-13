import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import {
  buildCheaperSensitivitySummary,
  buildConfidenceExplanation,
  buildExpensiveSensitivitySummary,
  buildRateSourceSummary,
  buildSensitivitySummary,
} from "@/lib/assistant-v2/commands/build-question-responses";
import type { AskQuestionPayload } from "@/lib/assistant-v2/intent/types";import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { contractorRateSourceLabel } from "@/lib/cost-engine/contractor-rate-source-label";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

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

function formatStructuredEstimateResponse(
  scopes: { name: string; included: boolean }[],
  summary: ReturnType<typeof parseQuickEstimateSummary>,
  constraints: string[],
  allowances: string[],
  mode: "included" | "excluded" | "assumptions" | "all"
): string {
  const includedScopes = scopes.filter((s) => s.included).map((s) => s.name);
  const excludedScopes = scopes.filter((s) => !s.included).map((s) => s.name);
  const missing = summary?.missingInformation ?? [];
  const assumptions = summary?.assumptions ?? [];
  const rateLines = summary?.rateSourceLines ?? [];

  const lines: string[] = [];

  if (mode === "all" || mode === "included") {
    lines.push("Included:");
    if (includedScopes.length > 0) {
      for (const name of includedScopes) {
        lines.push(`- ${name}`);
      }
    }
    for (const c of constraints.slice(0, 6)) {
      if (/allowance|access|rubbish|removal/i.test(c)) {
        lines.push(`- ${c}`);
      }
    }
    for (const a of allowances.slice(0, 6)) {
      lines.push(`- ${a}`);
    }
    if (
      lines.length === 1 &&
      includedScopes.length === 0 &&
      constraints.length === 0 &&
      allowances.length === 0
    ) {
      lines.push("- No work areas confirmed yet");
    }
  }

  if (mode === "all" || mode === "excluded") {
    if (lines.length > 0) lines.push("");
    lines.push("Excluded / not confirmed:");
    const excludedItems = [
      ...excludedScopes.map((name) => `${name} excluded from estimate`),
      ...missing.slice(0, 8).map((item) => {
        const normalized = item.replace(/^Missing:\s*/i, "");
        return normalized.endsWith(" not confirmed")
          ? normalized
          : `${normalized} not confirmed`;
      }),
    ];
    if (excludedItems.length === 0) {
      lines.push("- Nothing explicitly excluded");
    } else {
      for (const item of excludedItems.slice(0, 8)) {
        lines.push(`- ${item}`);
      }
    }
  }

  if (mode === "all" || mode === "assumptions") {
    if (lines.length > 0) lines.push("");
    lines.push("Assumptions:");
    const assumptionItems = [
      ...assumptions.slice(0, 6),
      ...(summary?.qualityLevel && summary.qualityLevel !== "unknown"
        ? [`${summary.qualityLevelNote ?? summary.qualityLevel} finish assumed`]
        : []),
      ...rateLines
        .filter((line) =>
          ["template_benchmark", "regional_fallback", "placeholder"].includes(
            line.rateSource
          )
        )
        .map(
          (line) =>
            `${contractorRateSourceLabel(line.rateSource as RateSource, {
              scopeLabel: line.label,
            })} used for ${line.workAreaName}`
        ),
      "Site verification required",
    ];
    for (const item of [...new Set(assumptionItems)].slice(0, 8)) {
      lines.push(`- ${item}`);
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
    case "confidence":
      message = buildConfidenceExplanation(summary);
      break;
    case "sensitivity":
      if (params.payload.sensitivityMode === "cheaper") {
        message = buildCheaperSensitivitySummary(summary);
      } else if (params.payload.sensitivityMode === "expensive") {
        message = buildExpensiveSensitivitySummary(summary);
      } else {
        message = buildSensitivitySummary(summary);
      }
      break;
    case "rates":
      message = buildRateSourceSummary(summary);
      break;
    case "breakdown":
      message = formatBreakdownResponse(summary);
      openBreakdown = true;
      break;
    case "whats_included":
    case "whats_excluded":
    case "assumptions":
      message = formatStructuredEstimateResponse(
        scopeRows,
        summary,
        summary?.constraintsApplied ?? [],
        summary?.allowances ?? [],
        params.payload.questionType === "whats_included"
          ? "all"
          : params.payload.questionType === "whats_excluded"
            ? "excluded"
            : "assumptions"
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
      if (summary?.rateSourceLines?.length) {
        const rateDetail = summary.rateSourceLines
          .map(
            (line) =>
              `${line.workAreaName}: ${contractorRateSourceLabel(
                line.rateSource as RateSource,
                { scopeLabel: line.label }
              )}`
          )
          .join("\n");
        message = `Here's what rates this estimate is using:\n\n${rateDetail}`;
      } else {
        message =
          "I can help with the estimate breakdown, what's included, or what details would sharpen the range. What would you like to know?";
      }
    }
  }

  const responseType =
    params.payload.questionType === "confidence"
      ? "confidence_explanation"
      : params.payload.questionType === "sensitivity"
        ? "sensitivity_summary"
        : params.payload.questionType === "rates"
          ? "rate_source_summary"
          : ["whats_included", "whats_excluded", "assumptions"].includes(
                params.payload.questionType
              )
            ? "included_excluded_summary"
            : "action_applied";

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: {
      messageType: "assistant_text",
      responseType,
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
