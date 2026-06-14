/**
 * Contractor language synonym clusters for Assistant V2 command routing.
 * Used by intent classifier and fact resolver — not shown to users.
 */

/** Verbs that signal removing or excluding something from the estimate */
export const REMOVE_VERBS =
  /\b(?:remove|delete|drop|forget|ignore|take\s+out|leave\s+out|exclude|no\s+longer\s+needed|don'?t\s+include|price\s+without)\b/i;

/** Verbs/phrases that signal adding or including something */
export const ADD_VERBS =
  /\b(?:add|include|put\s+in|allow\s+for|add\s+an\s+allowance\s+for|client\s+also\s+wants|there\s+is\s+also|we\s+need\s+to\s+include|include\s+pricing\s+for)\b/i;

/** Verbs that signal updating an existing value */
export const UPDATE_VERBS =
  /\b(?:change|update|make|set|adjust|revise|actually|instead|now\s+it\s+is|should\s+be|use|assume)\b/i;

/** Combined command verb pattern for early command detection */
export const COMMAND_VERB_PATTERN = new RegExp(
  `${REMOVE_VERBS.source}|${ADD_VERBS.source}|${UPDATE_VERBS.source}|\\b(?:increase|reduce|labour\\s+only|client\\s+suppl|exclude\\s+materials|size\\s+is|area\\s+is|\\d+(?:\\.\\d+)?\\s*m\\s*(?:long|high))\\b`,
  "i"
);

/** Size / measurement terms */
export const SIZE_TERMS =
  /\b(?:area|size|square\s*met(?:re|er)s?|sqm|m2|m²|length|long|height|high|width|wide|depth|distance)\b/i;

/** Finish / quality level synonyms → canonical level */
export const FINISH_LEVEL_SYNONYMS: Record<
  "budget" | "standard" | "premium",
  RegExp
> = {
  premium: /\b(?:premium|high-?end|top\s+spec|upmarket|high\s+quality|luxury)\b/i,
  standard: /\b(?:standard|mid-?range|normal|decent\s+quality)\b/i,
  budget: /\b(?:basic|budget|cheap(?:\s+and\s+cheerful)?|economy)\b/i,
};

/** Material supply phrasing */
export const MATERIAL_SUPPLY_PATTERNS =
  /\b(?:client\s+supplies?|owner\s+supplies?|supplied\s+by\s+(?:client|owner)|labour\s+only|install\s+only|exclude\s+materials|supply\s+and\s+install|include\s+materials|contractor\s+supplied|client\s+has\s+their\s+own)\b/i;

/** Rate-related question phrasing */
export const RATE_QUESTION_PATTERN =
  /\b(?:what\s+rates?\s+are\s+you\s+using|is\s+this\s+based\s+on\s+my\s+rates?|where\s+did\s+this\s+number\s+come\s+from|what\s+rate|use\s+my\s+rate|add\s+my\s+rate|change\s+rate|update\s+rate|benchmark|industry\s+rate)\b/i;

/** Confidence / accuracy question phrasing */
export const CONFIDENCE_QUESTION_PATTERN =
  /\b(?:how\s+accurate|how\s+confident|can\s+i\s+trust\s+this\s+number|why\s+is\s+it\s+rough|why\s+is\s+this\s+rough)\b/i;

/** Sensitivity / cost driver question phrasing */
export const SENSITIVITY_QUESTION_PATTERN =
  /\b(?:what\s+would\s+change\s+this\s+estimate|what\s+would\s+make\s+it\s+cheaper|what\s+would\s+make\s+it\s+more\s+expensive|what\s+are\s+the\s+biggest\s+cost\s+drivers|what\s+is\s+driving\s+the\s+cost)\b/i;

/** Explain estimate / why this price question phrasing */
export const EXPLAIN_ESTIMATE_QUESTION_PATTERN =
  /\b(?:why\s+is\s+(?:it|the\s+estimate)\s+(?:this\s+price|so\s+high|this\s+number)|why\s+is\s+this\s+price|explain\s+(?:the\s+)?estimate|where\s+did\s+the\s+number\s+come\s+from|what\s+is\s+driving\s+the\s+cost)\b/i;

/** Refinement / missing detail question phrasing */
export const REFINEMENT_QUESTION_PATTERN =
  /what details do you need|what other information do you need|what information would help|how can i refine|how can i make this more accurate|what would sharpen the estimate|why is this still rough|how do i improve confidence|what questions are missing|what do you still need from me|how can i make|what info would sharpen|what else do you need|what would make the range|make this more accurate|sharpen this estimate|tighten the estimate|more accurate|what other information|what else can i give|how do i sharpen|what information do you need|refine pricing|refine the pricing|what details would help|what info do you need|what information do you still need|what would help|what details are missing|what details would improve|improve confidence|sharpen|refine|tighten the range/i;

/** Work area add trigger phrases (beyond bare "add") */
export const ADD_WORK_AREA_TRIGGERS =
  /(?:there\s+is\s+also|client\s+also\s+wants|we\s+need\s+to\s+include|include\s+pricing\s+for|also\s+include|add\s+back|include\s+back)/i;

/** Work area exclude trigger phrases */
export const EXCLUDE_WORK_AREA_TRIGGERS =
  /(?:no\s+longer\s+wants|doesn'?t\s+want|do\s+not\s+want|not\s+want|client\s+no\s+longer\s+wants|remove|exclude|delete|take\s+out|take\s+the\s+.+\s+out|drop|forget|ignore|don'?t\s+include|price\s+(?:it\s+)?without)/i;

/** Margin update phrasing */
export const MARGIN_UPDATE_PATTERN =
  /\b(?:make|set|change|update)\s+(?:sell\s+)?margin\b|\bmargin\s+(?:to\s+)?\d/i;

/** Included / excluded question phrasing */
export const INCLUDED_QUESTION_PATTERN =
  /what'?s\s+included|what\s+is\s+included|included\s+in\s+this\s+estimate/i;
export const EXCLUDED_QUESTION_PATTERN =
  /what'?s\s+not\s+included|what\s+is\s+not\s+included|what\s+is\s+excluded|what'?s\s+excluded|what\s+are\s+you\s+excluding/i;
export const ASSUMPTIONS_QUESTION_PATTERN =
  /what\s+assumptions|what\s+are\s+you\s+assuming|what\s+assumptions\s+are\s+you\s+making/i;
