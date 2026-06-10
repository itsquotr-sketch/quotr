export const SCOPE_BUILDER_INPUT_TYPES = [
  { value: "typed_note", label: "Typed note" },
  { value: "phone_call_note", label: "Phone call note" },
  { value: "site_visit_note", label: "Site visit note" },
  { value: "email_paste", label: "Email paste" },
  { value: "voice_transcript", label: "Voice transcript" },
  { value: "other", label: "Other" },
] as const;

export const SCOPE_BUILDER_INPUT_STATUSES = [
  { value: "saved", label: "Saved" },
  { value: "pending", label: "Pending" },
  { value: "processed", label: "Processed" },
  { value: "archived", label: "Archived" },
] as const;

export type ScopeBuilderInputType =
  (typeof SCOPE_BUILDER_INPUT_TYPES)[number]["value"];

export type ScopeBuilderInputStatus =
  (typeof SCOPE_BUILDER_INPUT_STATUSES)[number]["value"];

export const SCOPE_BUILDER_INPUT_TYPE_VALUES = SCOPE_BUILDER_INPUT_TYPES.map(
  (item) => item.value
) as [ScopeBuilderInputType, ...ScopeBuilderInputType[]];

export const DEFAULT_SCOPE_BUILDER_INPUT_STATUS: ScopeBuilderInputStatus =
  "saved";

export const SCOPE_SUGGESTION_STATUSES = [
  { value: "pending", label: "Draft suggestion" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "converted", label: "Added to project" },
] as const;

export type ScopeSuggestionStatus =
  (typeof SCOPE_SUGGESTION_STATUSES)[number]["value"];

export const SCOPE_BUILDER_MISSING_QUESTION_EXAMPLES = [
  "Is the layout changing?",
  "Are materials supplied by the client?",
  "Is rubbish removal included?",
  "Are there access restrictions?",
] as const;

export function labelForScopeBuilderInputType(value: string): string {
  return (
    SCOPE_BUILDER_INPUT_TYPES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForScopeBuilderInputStatus(value: string): string {
  return (
    SCOPE_BUILDER_INPUT_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForScopeSuggestionStatus(value: string): string {
  return (
    SCOPE_SUGGESTION_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

export function formatSuggestionConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}% match`;
}
