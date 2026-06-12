"use client";

interface AssistantV2WelcomeProps {
  onSuggestionClick: (text: string) => void;
}

const EXAMPLE_CHIPS = [
  "Bathroom renovation",
  "Deck build",
  "Retaining wall",
  "Small renovation",
];

export function AssistantV2Welcome({ onSuggestionClick }: AssistantV2WelcomeProps) {
  return (
    <div className="mx-4 mb-3 rounded-xl border bg-card px-4 py-3 shadow-sm lg:mx-0">
      <p className="text-sm font-semibold">Tell Quotr about the job</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste notes from a call, describe what you saw on site, or add a rough
        scope. Quotr will identify the work, ask what matters, and build a draft
        estimate.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLE_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSuggestionClick(chip)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
