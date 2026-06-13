import { withTimeout } from "@/lib/ai/with-timeout";
import {
  resolveFactUpdate,
  type ScopeForFactResolution,
} from "@/lib/assistant-v2/facts/resolve-fact-update";
import {
  ALLOWANCE_DEFINITIONS,
  resolveAllowanceKey,
} from "@/lib/assistant-v2/intent/allowance-keys";
import {
  assistantIntentSchema,
  CONFIDENCE_EXECUTE_THRESHOLD,
  type AssistantIntent,
  type ClassifiedAssistantIntent,
  type UpdateAllowancePayload,
  type RemoveAllowancePayload,
  type UpdateConstraintPayload,
  type UpdateFinishLevelPayload,
  type WorkAreaCommandPayload,
  type AskQuestionPayload,
  type AskRefinementPayload,
  type UpdateScopeFactPayload,
  type OnlyIncludeWorkAreasPayload,
} from "@/lib/assistant-v2/intent/types";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";
import { getScopeByAlias } from "@/lib/scopes";

const INTENT_CLASSIFICATION_TIMEOUT_MS = 5000;

export type IntentClassificationContext = {
  workAreaNames?: string[];
  existingAllowanceKeys?: string[];
  qualityLevel?: string;
  hasConfirmedScopes?: boolean;
  scopes?: ScopeForFactResolution[];
};

const COMMAND_VERB_PATTERN =
  /\b(?:change|update|make|remove|delete|exclude|add|include|increase|reduce|set|actually)\b/i;

function parseMoneyAmount(text: string): number | null {
  const patterns = [
    /\$\s*([\d,]+(?:\.\d{1,2})?)/,
    /(?:to|at|of|=)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|k\b)/i,
    /\b([\d,]+(?:\.\d{1,2})?)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const raw = match[1].replace(/,/g, "");
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) continue;
    if (/\bk\b/i.test(match[0])) return num * 1000;
    return num;
  }

  return null;
}

function extractAllowanceSubject(text: string): string | null {
  const patterns = [
    /(?:increase|decrease|change|update|set|make)\s+(?:the\s+)?(.+?)\s+(?:allowance|to|from|at)/i,
    /(?:allowance for|allowance on)\s+(.+?)(?:\s+to|\s+from|\s*$)/i,
    /(.+?)\s+allowance/i,
    /(?:make|set)\s+(?:the\s+)?(.+?)\s+(?:bigger|larger|smaller|2k|to)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function classifyUpdateScopeFact(
  text: string,
  context: IntentClassificationContext
): ClassifiedAssistantIntent | null {
  if (!context.scopes?.length) return null;

  const resolution = resolveFactUpdate(context.scopes, text);
  if (!resolution.matched) return null;

  if (
    !resolution.scopeId ||
    !resolution.factKey ||
    !resolution.newValue ||
    !resolution.scopeName ||
    !resolution.factLabel
  ) {
    return {
      intent: "update_existing_fact",
      confidence: resolution.confidence,
      extractedPayload: null,
      requiresConfirmation: true,
      confirmationMessage:
        resolution.confirmationMessage ??
        "Which work area detail should I update?",
    };
  }

  const payload: UpdateScopeFactPayload = {
    scopeId: resolution.scopeId,
    scopeName: resolution.scopeName,
    factKey: resolution.factKey,
    factLabel: resolution.factLabel,
    newValue: resolution.newValue,
    previousValue: resolution.currentValue,
    unit: resolution.unit,
  };

  const requiresConfirmation =
    resolution.requiresConfirmation ||
    resolution.confidence < CONFIDENCE_EXECUTE_THRESHOLD;

  return {
    intent: "update_existing_fact",
    confidence: resolution.confidence,
    extractedPayload: payload,
    requiresConfirmation,
    confirmationMessage: requiresConfirmation
      ? resolution.confirmationMessage
      : undefined,
    confirmationOptions: requiresConfirmation
      ? [
          { id: "confirm", label: "Yes, update it" },
          { id: "ignore", label: "No, ignore" },
        ]
      : undefined,
  };
}

function classifyRemoveAllowance(
  text: string
): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase();
  if (!/(remove|delete|take out|drop|exclude)\s+/i.test(lower)) {
    return null;
  }

  if (
    /from\s+this\s+estimate|from\s+the\s+estimate|work\s*area|retaining\s+wall|deck|bathroom/i.test(
      lower
    ) &&
    !/allowance|rubbish|spoil|skip|contingency|engineering|cartage|bin|waste|trash|disposal/i.test(
      lower
    )
  ) {
    return null;
  }

  const allowanceHint = extractAllowanceSubject(text);
  const def = resolveAllowanceKey(allowanceHint ?? lower);
  if (!def && !/(allowance|rubbish|spoil|skip|contingency|engineering|cartage|waste|trash|disposal|bin)/i.test(text)) {
    return null;
  }

  if (!def) {
    return {
      intent: "remove_allowance",
      confidence: 0.55,
      extractedPayload: null,
      requiresConfirmation: true,
      confirmationMessage:
        "Which allowance should I remove from this estimate?",
    };
  }

  const payload: RemoveAllowancePayload = {
    allowanceKey: def.key,
    label: def.label,
  };

  return {
    intent: "remove_allowance",
    confidence: 0.92,
    extractedPayload: payload,
    requiresConfirmation: false,
  };
}

function classifyUpdateAllowance(
  text: string,
  context: IntentClassificationContext
): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase();
  const allowanceHint =
    extractAllowanceSubject(text) ??
    ALLOWANCE_DEFINITIONS.flatMap((def) => def.aliases).find((alias) =>
      lower.includes(alias)
    ) ??
    null;

  if (!allowanceHint && !/(allowance|rubbish|spoil|skip|contingency|engineering|cartage|after.?hours)/i.test(text)) {
    return null;
  }

  const def = resolveAllowanceKey(allowanceHint ?? lower);
  if (!def) {
    if (/rubbish|allowance/i.test(text)) {
      return {
        intent: "update_allowance",
        confidence: 0.55,
        extractedPayload: null,
        requiresConfirmation: true,
        confirmationMessage:
          "Do you want me to increase the rubbish removal allowance? What amount should I use?",
      };
    }
    return null;
  }

  const amount = parseMoneyAmount(text);
  const previousMatch = text.match(/from\s+\$?\s*([\d,]+)/i);
  const previousAmount = previousMatch
    ? Number(previousMatch[1].replace(/,/g, ""))
    : null;

  if (amount == null) {
    const vague = /bigger|larger|smaller|more|less|increase|decrease/i.test(text);
    return {
      intent: "update_allowance",
      confidence: vague ? 0.55 : 0.65,
      extractedPayload: {
        allowanceKey: def.key,
        label: def.label,
        amount: 0,
        previousAmount,
      } satisfies UpdateAllowancePayload,
      requiresConfirmation: true,
      confirmationMessage: vague
        ? `Do you want me to increase the ${def.label.toLowerCase()} allowance? What amount should I use?`
        : `What amount should I set for the ${def.label.toLowerCase()} allowance?`,
    };
  }

  const hasExisting = context.existingAllowanceKeys?.includes(def.key);
  const confidence = /(?:change|update|set|increase|decrease|to|from)/i.test(text)
    ? 0.95
    : /(?:can we|could we|make|maybe)/i.test(text)
      ? 0.72
      : 0.88;

  const payload: UpdateAllowancePayload = {
    allowanceKey: def.key,
    label: def.label,
    amount,
    previousAmount,
  };

  if (!hasExisting && /(?:change|update|set|increase)/i.test(text)) {
    return {
      intent: "update_allowance",
      confidence: 0.85,
      extractedPayload: payload,
      requiresConfirmation: true,
      confirmationMessage: `I couldn't find an existing ${def.label.toLowerCase()} allowance. Do you want me to add one for $${amount.toLocaleString("en-NZ")}?`,
      confirmationOptions: [
        { id: "confirm", label: "Yes, add allowance" },
        { id: "ignore", label: "No, ignore" },
      ],
    };
  }

  return {
    intent: "update_allowance",
    confidence,
    extractedPayload: payload,
    requiresConfirmation: confidence < CONFIDENCE_EXECUTE_THRESHOLD,
    confirmationMessage:
      confidence < CONFIDENCE_EXECUTE_THRESHOLD
        ? `Do you want me to set the ${def.label.toLowerCase()} allowance to $${amount.toLocaleString("en-NZ")}?`
        : undefined,
    confirmationOptions:
      confidence < CONFIDENCE_EXECUTE_THRESHOLD
        ? [
            { id: "confirm", label: "Yes, update allowance" },
            { id: "ignore", label: "No, ignore" },
          ]
        : undefined,
  };
}

function classifyFinishLevel(text: string): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase();

  if (
    looksLikeScopeNotes(text) &&
    !/(make it|set to|change to|actually|update to|switch to)/i.test(lower)
  ) {
    return null;
  }

  if (
    !/(premium|budget|standard|basic|mid.?range|high.?end|make it|finish level|finish)/i.test(
      lower
    )
  ) {
    return null;
  }

  let qualityLevel: "budget" | "standard" | "premium" | null = null;
  if (/premium|high.?end|high end|luxury/i.test(lower)) {
    qualityLevel = "premium";
  } else if (/budget|basic|economy/i.test(lower)) {
    qualityLevel = "budget";
  } else if (/standard|mid.?range|mid range/i.test(lower)) {
    qualityLevel = "standard";
  } else if (/make it premium|actually premium/i.test(lower)) {
    qualityLevel = "premium";
  }

  if (!qualityLevel) {
    return {
      intent: "update_finish_level",
      confidence: 0.5,
      extractedPayload: null,
      requiresConfirmation: true,
      confirmationMessage:
        "Which finish level should I use — budget, standard, or premium?",
    };
  }

  const confidence = /(?:make it|set to|change to|actually|update to)/i.test(
    lower
  )
    ? 0.92
    : 0.75;

  const payload: UpdateFinishLevelPayload = { qualityLevel };

  return {
    intent: "update_finish_level",
    confidence,
    extractedPayload: payload,
    requiresConfirmation: confidence < CONFIDENCE_EXECUTE_THRESHOLD,
    confirmationMessage:
      confidence < CONFIDENCE_EXECUTE_THRESHOLD
        ? `Do you want me to set the finish level to ${qualityLevel}?`
        : undefined,
    confirmationOptions:
      confidence < CONFIDENCE_EXECUTE_THRESHOLD
        ? [
            { id: "confirm", label: "Yes, update finish level" },
            { id: "ignore", label: "No, ignore" },
          ]
        : undefined,
  };
}

function extractWorkAreaName(text: string, verbPattern: string): string | null {
  const patterns = [
    new RegExp(
      `(?:${verbPattern})\\s+(?:the\\s+)?(.+?)(?:\\s+from\\s+this\\s+estimate|\\s+from\\s+the\\s+estimate|\\s+to\\s+this\\s+estimate|$)`,
      "i"
    ),
    new RegExp(`(?:${verbPattern})\\s+(?:a\\s+|an\\s+|the\\s+)?(.+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/\s+from\s+this\s+estimate.*$/i, "")
        .replace(/\s+to\s+this\s+estimate.*$/i, "")
        .trim();
    }
  }

  return null;
}

function matchWorkAreaName(
  candidate: string,
  workAreaNames: string[]
): string | null {
  const lower = candidate.toLowerCase();
  const exact = workAreaNames.find((name) => name.toLowerCase() === lower);
  if (exact) return exact;

  return (
    workAreaNames.find(
      (name) =>
        name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())
    ) ?? null
  );
}

function classifyWorkAreaCommand(
  text: string,
  context: IntentClassificationContext
): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase();

  const onlyIncludeMatch = lower.match(
    /only\s+(?:price|include|estimate)\s+(?:the\s+)?(.+?)(?:\.|$)/i
  );
  if (onlyIncludeMatch?.[1]) {
    const target = onlyIncludeMatch[1].trim();
    const matched = context.workAreaNames?.length
      ? matchWorkAreaName(target, context.workAreaNames)
      : null;

    const payload: OnlyIncludeWorkAreasPayload = {
      includedWorkAreaNames: matched ? [matched] : [target],
    };

    return {
      intent: "only_include_work_areas",
      confidence: matched ? 0.9 : 0.65,
      extractedPayload: payload,
      requiresConfirmation: !matched,
      confirmationMessage: matched
        ? undefined
        : `Should I price only ${target}? Other work areas will be excluded from the quick estimate.`,
    };
  }

  const wantsPermanentDelete = /\b(?:permanently|forever|delete permanently)\b/i.test(
    lower
  );

  const excludePattern =
    /(?:no longer wants|doesn't want|don't want|do not want|not want|remove|exclude|delete|take out|take the .+ out|drop)/i;

  if (excludePattern.test(lower)) {
    if (
      /allowance|rubbish removal allowance|spoil|skip|contingency|engineering allowance|cartage/i.test(
        lower
      ) &&
      !/retaining\s*wall|deck|bathroom|work\s*area|landscap|fence|kitchen|roof/i.test(
        lower
      )
    ) {
      return null;
    }

    const noLongerWantsMatch = /(?:no longer wants|doesn't want|don't want)\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:,|\s+remove|\s+from|\s*$)/i.exec(
      text
    );

    const extractedRemove = extractWorkAreaName(
      text,
      "remove|exclude|delete|take out|take the"
    );

    const trivialNames = new Set(["it", "this", "that", "them"]);
    const name =
      noLongerWantsMatch?.[1]?.trim() ??
      (extractedRemove && !trivialNames.has(extractedRemove.toLowerCase())
        ? extractedRemove
        : null);

    if (!name) return null;

    const matched = context.workAreaNames?.length
      ? matchWorkAreaName(name, context.workAreaNames)
      : null;

    const payload: WorkAreaCommandPayload = {
      workAreaName: matched ?? name,
      scopeId: undefined,
      isCustom: !matched,
      permanentDelete: wantsPermanentDelete,
    };

    if (wantsPermanentDelete) {
      return {
        intent: "remove_work_area",
        confidence: matched ? 0.85 : 0.6,
        extractedPayload: payload,
        requiresConfirmation: true,
        confirmationMessage: matched
          ? `Do you want to permanently delete ${matched}? This cannot be undone.`
          : `Do you want to permanently delete "${name}"?`,
        confirmationOptions: [
          { id: "confirm", label: "Yes, delete permanently" },
          { id: "ignore", label: "No, just exclude from estimate" },
        ],
      };
    }

    return {
      intent: "exclude_work_area",
      confidence: matched ? 0.93 : 0.7,
      extractedPayload: payload,
      requiresConfirmation: !matched,
      confirmationMessage: matched
        ? undefined
        : `I couldn't find "${name}" in this estimate. Do you want to exclude a different work area?`,
    };
  }

  if (
    /(?:also include|add back|include back|add .+ back in)/i.test(lower) ||
    /^add\s+/i.test(lower.trim())
  ) {
    const verbPattern = /(?:also include|add back|include back|add)\s+(?:back\s+in\s+)?/i.test(
      lower
    )
      ? "also include|add back|include back|add back in|add"
      : "add";
    const name = extractWorkAreaName(text, verbPattern);
    if (!name) return null;

    const matched = context.workAreaNames?.length
      ? matchWorkAreaName(name, context.workAreaNames)
      : null;

    if (matched) {
      return {
        intent: "include_work_area",
        confidence: 0.9,
        extractedPayload: { workAreaName: matched, scopeId: undefined },
        requiresConfirmation: false,
      };
    }

    const supportedScope = getScopeByAlias(name);
    const isSupported = Boolean(supportedScope);
    const displayName =
      supportedScope?.name ?? name.charAt(0).toUpperCase() + name.slice(1);

    return {
      intent: "add_work_area",
      confidence: isSupported ? 0.82 : 0.68,
      extractedPayload: {
        workAreaName: displayName,
        isCustom: !isSupported,
      },
      requiresConfirmation: !isSupported,
      confirmationMessage: isSupported
        ? undefined
        : `Do you want to add ${displayName} as a custom work area? It will need pricing before the estimate can include it.`,
      confirmationOptions: isSupported
        ? undefined
        : [
            { id: "confirm", label: "Yes, add work area" },
            { id: "ignore", label: "No, ignore" },
          ],
    };
  }

  if (/include\s+/i.test(lower)) {
    const name = extractWorkAreaName(text, "include");
    if (!name) return null;
    const matched = context.workAreaNames?.length
      ? matchWorkAreaName(name, context.workAreaNames)
      : null;

    return {
      intent: "include_work_area",
      confidence: matched ? 0.9 : 0.65,
      extractedPayload: { workAreaName: matched ?? name },
      requiresConfirmation: !matched,
    };
  }

  return null;
}

const CONSTRAINT_PHRASES: { pattern: RegExp; slug: string }[] = [
  { pattern: /tight\s+access/i, slug: "tight-access" },
  { pattern: /poor\s+parking/i, slug: "poor-parking" },
  { pattern: /occupied\s+house/i, slug: "occupied-house" },
  { pattern: /restricted\s+hours|after.?hours\s+work/i, slug: "restricted-hours" },
  { pattern: /urgent\s+turnaround|rush/i, slug: "urgent-turnaround" },
  { pattern: /carting\s+distance/i, slug: "carting-distance" },
  { pattern: /engineering\s+risk|engineering\s+required/i, slug: "retaining-engineering-risk" },
  { pattern: /rubbish\s+removal\s+required/i, slug: "rubbish-removal-required" },
];

function classifyConstraint(text: string): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  const isCommandPhrase =
    wordCount <= 8 ||
    /\b(applies|required|needed)\b/i.test(lower);

  if (!isCommandPhrase) {
    return null;
  }

  if (!/(applies|required|constraint|site condition|access|parking|occupied)/i.test(lower)) {
    for (const { pattern, slug } of CONSTRAINT_PHRASES) {
      if (pattern.test(text) && /applies|required|yes|needed/i.test(lower)) {
        const constraint = getConstraintBySlug(slug);
        const payload: UpdateConstraintPayload = {
          slug,
          label: constraint?.label ?? slug,
          apply: true,
        };
        return {
          intent: "update_constraint",
          confidence: 0.9,
          extractedPayload: payload,
          requiresConfirmation: false,
        };
      }
    }
    return null;
  }

  for (const { pattern, slug } of CONSTRAINT_PHRASES) {
    if (pattern.test(text)) {
      const constraint = getConstraintBySlug(slug);
      const apply = !/(doesn't|does not|no|not)\s+apply/i.test(lower);
      const payload: UpdateConstraintPayload = {
        slug,
        label: constraint?.label ?? slug,
        apply,
      };
      return {
        intent: "update_constraint",
        confidence: /applies|required/i.test(lower) ? 0.92 : 0.78,
        extractedPayload: payload,
        requiresConfirmation: !/applies|required/i.test(lower),
        confirmationMessage: apply
          ? `Should I apply "${constraint?.label ?? slug}" to this estimate?`
          : undefined,
      };
    }
  }

  return null;
}

const REFINEMENT_QUESTION_PATTERN =
  /what details do you need|what other information do you need|what information would help|how can i refine|how can i make this more accurate|what would sharpen the estimate|why is this still rough|how do i improve confidence|what questions are missing|what do you still need from me|how can i make|what info would sharpen|what else do you need|what would make the range|make this more accurate|sharpen this estimate|tighten the estimate|more accurate|what other information|what else can i give|how do i sharpen|what information do you need|refine pricing|refine the pricing|what details would help|what info do you need|what information do you still need|what would help|what details are missing|what details would improve|improve confidence/i;

function extractRefinementScopeName(
  text: string,
  workAreaNames?: string[]
): string | undefined {
  const improveMatch = text.match(
    /what details would improve\s+(?:the\s+)?(.+?)(?:\?|$)/i
  );
  if (improveMatch?.[1]) {
    const candidate = improveMatch[1].trim();
    if (workAreaNames?.length) {
      return matchWorkAreaName(candidate, workAreaNames) ?? candidate;
    }
    return candidate;
  }

  if (!workAreaNames?.length) return undefined;

  const lower = text.toLowerCase();
  for (const name of workAreaNames) {
    if (lower.includes(name.toLowerCase())) {
      return name;
    }
  }

  return undefined;
}

function classifyRefinementQuestion(
  text: string,
  context: IntentClassificationContext
): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase().trim();

  if (!REFINEMENT_QUESTION_PATTERN.test(lower)) {
    return null;
  }

  const scopeName = extractRefinementScopeName(text, context.workAreaNames);
  const payload: AskRefinementPayload = scopeName ? { scopeName } : {};

  return {
    intent: "ask_refinement_question",
    confidence: 0.95,
    extractedPayload: payload,
    requiresConfirmation: false,
  };
}

function classifyAskQuestion(text: string): ClassifiedAssistantIntent | null {
  const lower = text.toLowerCase();

  if (/show.*breakdown|cost breakdown|break down|breakdown/i.test(lower)) {
    return {
      intent: "ask_question",
      confidence: 0.95,
      extractedPayload: { questionType: "breakdown" } satisfies AskQuestionPayload,
      requiresConfirmation: false,
    };
  }

  if (
    /what.*included|what's included|what is included|included in this estimate/i.test(
      lower
    )
  ) {
    return {
      intent: "ask_question",
      confidence: 0.95,
      extractedPayload: {
        questionType: "whats_included",
      } satisfies AskQuestionPayload,
      requiresConfirmation: false,
    };
  }

  if (
    /what\s+is\s+internal\s+alteration|internal\s+alteration\s+mean/i.test(
      lower
    )
  ) {
    return {
      intent: "ask_question",
      confidence: 0.95,
      extractedPayload: {
        questionType: "internal_alteration",
      } satisfies AskQuestionPayload,
      requiresConfirmation: false,
    };
  }

  if (/^(what|how|why|when|where|who|can you|could you|is|are|do|does)\b/i.test(lower.trim())) {
    return {
      intent: "ask_question",
      confidence: 0.85,
      extractedPayload: { questionType: "general" } satisfies AskQuestionPayload,
      requiresConfirmation: false,
    };
  }

  return null;
}

function looksLikeScopeNotes(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\d+\s*(?:m²|m2|sqm|square)/i.test(text)) return true;
  if (/(deck|bathroom|retaining|renovation|extension|fence|roof)/i.test(lower)) {
    return true;
  }
  return text.trim().split(/\s+/).length >= 6;
}

async function classifyWithAi(
  text: string
): Promise<ClassifiedAssistantIntent | null> {
  const { getOpenAiClient, getOpenAiDiscoveryModel } = await import(
    "@/lib/ai/openai-client"
  );
  const openai = getOpenAiClient();
  if (!openai) return null;

  const prompt = `Classify this construction project assistant message into exactly one intent.
Intents: new_scope_notes, update_allowance, remove_allowance, update_constraint, update_finish_level, include_work_area, exclude_work_area, add_work_area, ask_question, unknown.
Return JSON: {"intent":"...","confidence":0.0-1.0}
Message: ${text}`;

  try {
    const response = await withTimeout(
      openai.responses.create({
        model: getOpenAiDiscoveryModel(),
        input: prompt,
        max_output_tokens: 100,
      }),
      INTENT_CLASSIFICATION_TIMEOUT_MS,
      "Intent classification"
    );

    const raw =
      response.output_text?.trim() ??
      "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      intent?: string;
      confidence?: number;
    };
    const intentResult = assistantIntentSchema.safeParse(parsed.intent);
    if (!intentResult.success) return null;

    return {
      intent: intentResult.data,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.6))),
      extractedPayload: null,
      requiresConfirmation: Number(parsed.confidence ?? 0.6) < CONFIDENCE_EXECUTE_THRESHOLD,
    };
  } catch {
    return null;
  }
}

function ruleBasedClassify(
  text: string,
  context: IntentClassificationContext
): ClassifiedAssistantIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      intent: "unknown",
      confidence: 0,
      extractedPayload: null,
      requiresConfirmation: true,
      confirmationMessage: "What would you like me to do?",
    };
  }

  const hasScopes = Boolean(context.hasConfirmedScopes && context.scopes?.length);
  const commandFirst = hasScopes && COMMAND_VERB_PATTERN.test(trimmed);

  const commandClassifiers = [
    () => classifyRefinementQuestion(trimmed, context),
    () => classifyAskQuestion(trimmed),
    () => classifyUpdateScopeFact(trimmed, context),
    () => classifyRemoveAllowance(trimmed),
    () => classifyConstraint(trimmed),
    () => classifyUpdateAllowance(trimmed, context),
    () => classifyFinishLevel(trimmed),
    () => classifyWorkAreaCommand(trimmed, context),
  ];

  const discoveryClassifiers = [
    () => classifyRemoveAllowance(trimmed),
    () => classifyRefinementQuestion(trimmed, context),
    () => classifyAskQuestion(trimmed),
    () => classifyConstraint(trimmed),
    () => classifyUpdateAllowance(trimmed, context),
    () => classifyFinishLevel(trimmed),
    () => classifyWorkAreaCommand(trimmed, context),
  ];

  const classifiers = commandFirst ? commandClassifiers : discoveryClassifiers;

  for (const classify of classifiers) {
    const result = classify();
    if (result) return result;
  }

  if (looksLikeScopeNotes(trimmed) && !commandFirst) {
    return {
      intent: "new_scope_notes",
      confidence: 0.85,
      extractedPayload: null,
      requiresConfirmation: false,
    };
  }

  if (commandFirst) {
    const factAttempt = classifyUpdateScopeFact(trimmed, context);
    if (factAttempt) return factAttempt;
  }

  return {
    intent: "unknown",
    confidence: 0.4,
    extractedPayload: null,
    requiresConfirmation: true,
    confirmationMessage:
      "I'm not sure what you'd like me to do. Can you clarify?",
  };
}

export async function classifyAssistantIntent(
  text: string,
  context: IntentClassificationContext = {}
): Promise<ClassifiedAssistantIntent> {
  const ruleResult = ruleBasedClassify(text, context);

  if (
    ruleResult.confidence >= CONFIDENCE_EXECUTE_THRESHOLD ||
    ruleResult.intent !== "unknown"
  ) {
    return ruleResult;
  }

  try {
    const aiResult = await classifyWithAi(text);
    if (aiResult && aiResult.confidence > ruleResult.confidence) {
      return aiResult;
    }
  } catch {
    // fall through to rule result
  }

  return ruleResult;
}

export function shouldRunDiscovery(intent: AssistantIntent): boolean {
  return intent === "new_scope_notes";
}

export function finishLevelLabel(level: string): string {
  return normaliseQualityLevel(level) === "premium"
    ? "Premium / high-end"
    : normaliseQualityLevel(level) === "budget"
      ? "Budget / basic"
      : normaliseQualityLevel(level) === "standard"
        ? "Standard / mid-range"
        : level;
}
