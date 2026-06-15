import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";

import type { BenchmarkScopeForOnboarding } from "@/components/assistant-v2/scope-rate-onboarding-dialog";



export type WideRangeAction =

  | { kind: "finish_level"; label: string }

  | { kind: "missing_item"; item: CurrentMissingItem; label: string }

  | { kind: "add_rate"; label: string; scope?: BenchmarkScopeForOnboarding }

  | { kind: "composer"; label: string; prefill: string };



function shortMissingLabel(item: CurrentMissingItem): string {

  const scope = item.scopeLabel;

  const fact = item.label.replace(/^[^:]+:\s*/i, "").replace(/ not confirmed$/i, "").toLowerCase();



  if (fact.includes("height")) return `Add ${scope.toLowerCase()} height`;

  if (fact.includes("type") || fact.includes("material")) {

    return `Add ${scope.toLowerCase()} details`;

  }

  if (fact.includes("area")) return `Confirm ${scope.toLowerCase()} area`;

  if (fact.includes("level")) return `Confirm ${scope.toLowerCase()} level`;

  return "Add missing info";

}



export function resolveWideRangeAction(input: {

  isQualityUnknown: boolean;

  criticalMissing: CurrentMissingItem[];

  actionableMissingItems: CurrentMissingItem[];

  usesBenchmarkRates: boolean;

  primaryOnboardingScope?: BenchmarkScopeForOnboarding | null;

}): WideRangeAction | null {

  if (input.isQualityUnknown) {

    return {

      kind: "finish_level",

      label: "Choose spec level",

    };

  }



  const missing =

    input.criticalMissing[0] ??

    input.actionableMissingItems.find(

      (item) =>

        item.status === "missing" &&

        (item.importance === "critical" || item.importance === "useful")

    );



  if (missing) {

    return {

      kind: "missing_item",

      item: missing,

      label: shortMissingLabel(missing),

    };

  }



  if (input.usesBenchmarkRates && input.primaryOnboardingScope) {

    const scopeLabel =

      input.primaryOnboardingScope.label ?? "this scope";

    return {

      kind: "add_rate",

      label: `Add ${scopeLabel.toLowerCase()} rate`,

      scope: input.primaryOnboardingScope,

    };

  }



  return {

    kind: "composer",

    label: "Add missing info",

    prefill: "The main detail I need to confirm is ",

  };

}

