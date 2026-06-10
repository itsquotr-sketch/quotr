export const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure yet" },
] as const;

export const UNIVERSAL_TEMPLATE_CONSTRAINTS = [
  {
    key: "tight_access",
    label: "Tight access",
    slug: "tight-access",
    driverSlug: "tight-access",
    universal: true,
  },
  {
    key: "poor_parking",
    label: "Poor parking",
    slug: "poor-parking",
    driverSlug: "poor-parking",
    universal: true,
  },
  {
    key: "occupied_house",
    label: "Occupied house",
    slug: "occupied-house",
    driverSlug: "occupied-house",
    universal: true,
  },
  {
    key: "restricted_working_hours",
    label: "Restricted working hours",
    slug: "restricted-hours",
    driverSlug: "restricted-hours",
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
    label: "Urgent turnaround",
    slug: "urgent-turnaround",
    driverSlug: "urgent-turnaround",
    universal: true,
  },
  {
    key: "long_carting_distance",
    label: "Long carting distance",
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
