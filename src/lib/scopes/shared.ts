import type { ScopeFactOption } from "@/lib/scopes/types";

export const YES_NO_UNSURE: ScopeFactOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure yet" },
];

export const UNIVERSAL_SCOPE_CONSTRAINTS = [
  {
    key: "tight_access",
    label: "Is access tight?",
    questionText: "Is access tight?",
    slug: "tight-access",
    driverSlug: "tight-access",
    hideWhenFactAnswered: "access_restrictions",
    universal: true,
  },
  {
    key: "poor_parking",
    label: "Is parking poor?",
    questionText: "Is parking poor?",
    slug: "poor-parking",
    driverSlug: "poor-parking",
    universal: true,
  },
  {
    key: "occupied_house",
    label: "Is the home occupied?",
    questionText: "Is the home occupied?",
    slug: "occupied-house",
    driverSlug: "occupied-house",
    universal: true,
  },
  {
    key: "restricted_working_hours",
    label: "Are working hours restricted?",
    questionText: "Are working hours restricted?",
    slug: "restricted-hours",
    driverSlug: "restricted-hours",
    hideWhenFactAnswered: "time_constraints",
    universal: true,
    followUp: {
      label: "Describe restricted hours",
      unit: "",
      valueKey: "description",
      inputType: "text" as const,
    },
  },
  {
    key: "urgent_turnaround",
    label: "Is turnaround urgent?",
    questionText: "Is turnaround urgent?",
    slug: "urgent-turnaround",
    driverSlug: "urgent-turnaround",
    hideWhenFactAnswered: "time_constraints",
    universal: true,
  },
  {
    key: "long_carting_distance",
    label: "Is carting distance long?",
    questionText: "Is carting distance long?",
    slug: "carting-distance",
    driverSlug: "20m-carting",
    universal: true,
    followUp: {
      label: "Approximate carting distance?",
      unit: "metres",
      valueKey: "metres",
      inputType: "number" as const,
    },
  },
  {
    key: "rubbish_removal_required",
    label: "Is rubbish removal required?",
    questionText: "Is rubbish removal required?",
    slug: "rubbish-removal-required",
    hideWhenFactAnswered: "rubbish_removal",
    universal: true,
    followUp: {
      label: "Rubbish removal level",
      unit: "",
      valueKey: "severity",
      inputType: "select" as const,
      options: [
        { value: "low", label: "Low" },
        { value: "typical", label: "Typical" },
        { value: "high", label: "High" },
      ],
    },
  },
];
