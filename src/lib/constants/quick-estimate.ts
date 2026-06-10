export const QUICK_ESTIMATE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "ready", label: "Ready" },
  { value: "presented", label: "Presented" },
  { value: "accepted_to_quote", label: "Accepted to quote" },
  { value: "declined", label: "Declined" },
  { value: "archived", label: "Archived" },
] as const;

export const QUICK_ESTIMATE_CONFIDENCE_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const QUICK_ESTIMATE_BUDGET_FIT = [
  { value: "unknown", label: "Unknown" },
  { value: "below_budget", label: "Below budget" },
  { value: "within_budget", label: "Within budget" },
  { value: "above_budget", label: "Above budget" },
] as const;

export type QuickEstimateStatus =
  (typeof QUICK_ESTIMATE_STATUSES)[number]["value"];
export type QuickEstimateConfidenceLevel =
  (typeof QUICK_ESTIMATE_CONFIDENCE_LEVELS)[number]["value"];
export type QuickEstimateBudgetFit =
  (typeof QUICK_ESTIMATE_BUDGET_FIT)[number]["value"];

export const DEFAULT_TARGET_MARGIN_PERCENT = 20;

export const QUICK_ESTIMATE_WIZARD_STEPS = [
  { step: 1, title: "Tell us what you know", key: "notes" },
  { step: 2, title: "Basic questions", key: "questions" },
  { step: 3, title: "What might make this job harder?", key: "drivers" },
  { step: 4, title: "Review quick estimate", key: "review" },
] as const;

export const QUICK_ESTIMATE_QUESTIONS = [
  {
    key: "work_type",
    text: "What is the main type of work?",
    type: "select" as const,
    options: [
      { value: "bathroom-renovation", label: "Bathroom renovation" },
      { value: "kitchen-renovation", label: "Kitchen renovation" },
      { value: "deck", label: "Deck" },
      { value: "internal-alteration", label: "Internal alteration" },
      { value: "roofing", label: "Roofing" },
      { value: "landscaping", label: "Landscaping" },
      { value: "electrical", label: "Electrical" },
      { value: "plumbing", label: "Plumbing" },
      { value: "painting", label: "Painting" },
      { value: "fencing", label: "Fencing" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "approximate_size",
    text: "Approximate size / area?",
    type: "text" as const,
    placeholder: "e.g. 12 m² bathroom, small deck, whole house repaint",
  },
  {
    key: "access_easy",
    text: "Is access easy?",
    type: "select" as const,
    options: [
      { value: "yes", label: "Yes — straightforward access" },
      { value: "partial", label: "Partially — some restrictions" },
      { value: "no", label: "No — difficult access" },
      { value: "unknown", label: "Not sure yet" },
    ],
  },
  {
    key: "client_budget_known",
    text: "Is the client budget known?",
    type: "select" as const,
    options: [
      { value: "yes", label: "Yes — client shared a budget" },
      { value: "rough", label: "Rough idea only" },
      { value: "no", label: "No — not discussed" },
    ],
  },
  {
    key: "finish_level",
    text: "What level of finish?",
    type: "select" as const,
    options: [
      { value: "budget", label: "Budget" },
      { value: "standard", label: "Standard" },
      { value: "premium", label: "Premium" },
      { value: "architectural", label: "Architectural" },
      { value: "unknown", label: "Not sure yet" },
    ],
  },
  {
    key: "time_constraints",
    text: "Are there time constraints?",
    type: "select" as const,
    options: [
      { value: "none", label: "No — normal programme" },
      { value: "urgent", label: "Yes — urgent turnaround" },
      { value: "staged", label: "Staged works required" },
      { value: "after_hours", label: "After hours required" },
      { value: "unknown", label: "Not sure yet" },
    ],
  },
  {
    key: "risks_unknowns",
    text: "Any obvious risk or unknowns?",
    type: "textarea" as const,
    placeholder: "e.g. subfloor condition unknown, possible asbestos, client-supplied tiles",
  },
] as const;

/** Placeholder base cost ranges by work type — not production pricing. */
export const PLACEHOLDER_BASE_RANGES: Record<
  string,
  { low: number; high: number }
> = {
  "bathroom-renovation": { low: 15000, high: 35000 },
  "kitchen-renovation": { low: 20000, high: 50000 },
  deck: { low: 8000, high: 25000 },
  "internal-alteration": { low: 10000, high: 40000 },
  roofing: { low: 8000, high: 30000 },
  landscaping: { low: 5000, high: 20000 },
  electrical: { low: 2000, high: 15000 },
  plumbing: { low: 2000, high: 15000 },
  painting: { low: 3000, high: 12000 },
  fencing: { low: 3000, high: 10000 },
  other: { low: 5000, high: 25000 },
};
