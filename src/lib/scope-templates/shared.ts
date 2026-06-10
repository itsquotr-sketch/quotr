export const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure yet" },
] as const;

export const UNIVERSAL_TEMPLATE_CONSTRAINTS = [
  {
    key: "tight_access",
    label: "Is access tight?",
    slug: "tight-access",
    driverSlug: "tight-access",
    hideWhenQuestionAnswered: "access_restrictions",
    universal: true,
  },
  {
    key: "poor_parking",
    label: "Is parking poor?",
    slug: "poor-parking",
    driverSlug: "poor-parking",
    universal: true,
  },
  {
    key: "occupied_house",
    label: "Is the home occupied?",
    slug: "occupied-house",
    driverSlug: "occupied-house",
    universal: true,
  },
  {
    key: "restricted_working_hours",
    label: "Are working hours restricted?",
    slug: "restricted-hours",
    driverSlug: "restricted-hours",
    hideWhenQuestionAnswered: "time_constraints",
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
    slug: "urgent-turnaround",
    driverSlug: "urgent-turnaround",
    hideWhenQuestionAnswered: "time_constraints",
    universal: true,
  },
  {
    key: "long_carting_distance",
    label: "Is carting distance long?",
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
];
