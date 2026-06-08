export const ENQUIRY_SOURCES = [
  { value: "site_visit", label: "Site visit" },
  { value: "phone_call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website enquiry" },
  { value: "plans_specs", label: "Plans / specs received" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
] as const;

export const PROJECT_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const ENQUIRY_STATUSES = [
  { value: "new", label: "New enquiry" },
  { value: "contacted", label: "Contacted" },
  { value: "site_visit_booked", label: "Site visit booked" },
  { value: "awaiting_info", label: "Awaiting information" },
  { value: "qualified", label: "Qualified" },
  { value: "declined", label: "Declined" },
] as const;

export const PROJECT_STATUSES = [
  { value: "new", label: "New" },
  { value: "lead", label: "Lead" },
  { value: "captured", label: "Captured" },
  { value: "scoping", label: "Scoping" },
  { value: "estimating", label: "Estimating" },
  { value: "waiting_on_subbies", label: "Waiting on subbies" },
  { value: "ready_to_quote", label: "Ready to quote" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export const PROJECT_STATUS_VALUES = PROJECT_STATUSES.map((s) => s.value) as [
  ProjectStatus,
  ...ProjectStatus[],
];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = "new";

/** In-flight projects — excludes won, lost, and archived. */
export const ACTIVE_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "new",
  "lead",
  "captured",
  "scoping",
  "estimating",
  "waiting_on_subbies",
  "ready_to_quote",
  "quoted",
];

export const QUOTE_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
] as const;

export const SCOPE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "capturing", label: "Capturing" },
  { value: "ready", label: "Ready" },
  { value: "estimating", label: "Estimating" },
  { value: "complete", label: "Complete" },
] as const;

export const AI_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
] as const;

export const ESTIMATE_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "In review" },
  { value: "complete", label: "Complete" },
] as const;

export type EnquirySource = (typeof ENQUIRY_SOURCES)[number]["value"];
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]["value"];

export function isActiveProjectStatus(status: string): status is ProjectStatus {
  return (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(status);
}

export function labelFor<T extends { value: string; label: string }>(
  items: readonly T[],
  value: string
): string {
  return items.find((item) => item.value === value)?.label ?? value;
}
