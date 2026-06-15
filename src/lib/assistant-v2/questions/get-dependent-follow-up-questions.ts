import type { ScopeKnownFactsResult } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import {
  getKnownFactValue,
  isFactKnown,
  shouldSkipQuestion,
} from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import { getTrackableFactsForWorkAreaType } from "@/lib/assistant-v2/discovery/generic-scope-discovery";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import type { ScopeFactDefinition } from "@/lib/scopes/types";

export type FollowUpQuestion = {
  factKey: string;
  questionText: string;
  scopeId: string;
  scopeTypeKey: string;
  priority: number;
};

const MAX_FOLLOW_UPS = 2;

function findFact(
  scopeTypeKey: string,
  keySuffix: string
): ScopeFactDefinition | null {
  const scope = getScopeByWorkAreaType(scopeTypeKey);
  if (scope) {
    return (
      getAllFactsForScope(scope).find((f) => f.key.endsWith(`.${keySuffix}`)) ??
      getAllFactsForScope(scope).find((f) => f.key === keySuffix) ??
      null
    );
  }

  const trackable = getTrackableFactsForWorkAreaType(scopeTypeKey);
  const match = trackable.find(
    (f) => f.key.endsWith(`.${keySuffix}`) || f.key === keySuffix
  );
  return match as ScopeFactDefinition | null;
}

function addIfMissing(
  candidates: FollowUpQuestion[],
  knownFacts: ScopeKnownFactsResult,
  scopeId: string,
  scopeTypeKey: string,
  keySuffix: string,
  questionText: string,
  priority: number
): void {
  const fact = findFact(scopeTypeKey, keySuffix);
  if (!fact || shouldSkipQuestion(knownFacts, fact)) return;

  candidates.push({
    factKey: fact.key,
    questionText,
    scopeId,
    scopeTypeKey,
    priority,
  });
}

function deckFollowUps(
  knownFacts: ScopeKnownFactsResult,
  scopeId: string,
  scopeTypeKey: string,
  changedFactKey?: string
): FollowUpQuestion[] {
  const candidates: FollowUpQuestion[] = [];
  const levelType = getKnownFactValue(knownFacts, "deck.level_type");
  const heightM = Number(getKnownFactValue(knownFacts, "deck.height_m") ?? 0);
  const balustrade = getKnownFactValue(knownFacts, "deck.has_balustrade");
  const stairs = getKnownFactValue(knownFacts, "deck.has_stairs");

  const levelChanged =
    changedFactKey?.includes("level_type") ||
    levelType === "elevated";

  if (levelType === "elevated" || levelChanged) {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "height_m",
      "How high off the ground is the deck?",
      100
    );
  }

  if (heightM > 1 || levelType === "elevated") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "has_balustrade",
      "Is balustrade required?",
      90
    );
  }

  if (balustrade === "yes") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "balustrade_supply",
      "Is balustrade supply and install, or install only?",
      80
    );
  }

  if (stairs === "yes") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "stair_count",
      "How many stairs or approximate stair height?",
      70
    );
  }

  return candidates;
}

function fenceFollowUps(
  knownFacts: ScopeKnownFactsResult,
  scopeId: string,
  scopeTypeKey: string
): FollowUpQuestion[] {
  const candidates: FollowUpQuestion[] = [];
  const lengthKnown = isFactKnown(knownFacts, "fence.length_m");

  if (!lengthKnown) {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "length_m",
      "What is the total fence length?",
      100
    );
  }

  if (lengthKnown && !isFactKnown(knownFacts, "fence.height_m")) {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "height_m",
      "How high is the fence?",
      95
    );
  }

  if (
    isFactKnown(knownFacts, "fence.length_m") &&
    !isFactKnown(knownFacts, "fence.fence_type") &&
    !isFactKnown(knownFacts, "fence.material_type")
  ) {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "fence_type",
      "What type of fence should I assume?",
      90
    );
  }

  return candidates;
}

function retainingWallFollowUps(
  knownFacts: ScopeKnownFactsResult,
  scopeId: string,
  scopeTypeKey: string
): FollowUpQuestion[] {
  const candidates: FollowUpQuestion[] = [];
  const heightM = Number(
    getKnownFactValue(knownFacts, "retaining_wall.height_m") ?? 0
  );
  const drainage = getKnownFactValue(knownFacts, "retaining_wall.has_drainage");
  const spoil = getKnownFactValue(
    knownFacts,
    "retaining_wall.has_spoil_removal"
  );

  if (heightM > 1.5) {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "engineering_required",
      "Is engineering or consent required?",
      100
    );
  }

  if (drainage === "yes") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "drainage_materials",
      "Should drainage materials be included?",
      90
    );
  }

  if (spoil === "yes") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "carting_distance_m",
      "What is the carting distance?",
      85
    );
  }

  return candidates;
}

function bathroomFollowUps(
  knownFacts: ScopeKnownFactsResult,
  scopeId: string,
  scopeTypeKey: string
): FollowUpQuestion[] {
  const candidates: FollowUpQuestion[] = [];
  const layoutChanging = getKnownFactValue(
    knownFacts,
    "bathroom.layout_changing"
  );
  const tileExtent = getKnownFactValue(knownFacts, "bathroom.tile_extent");

  if (layoutChanging === "yes") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "plumbing_relocation",
      "Are plumbing locations changing?",
      100
    );
  }

  if (tileExtent === "full") {
    addIfMissing(
      candidates,
      knownFacts,
      scopeId,
      scopeTypeKey,
      "wall_tile_area_m2",
      "What wall tile area should I allow for?",
      90
    );
  }

  return candidates;
}

export function getDependentFollowUpQuestions(input: {
  knownFacts: ScopeKnownFactsResult;
  changedFactKey?: string;
}): FollowUpQuestion[] {
  const { knownFacts, changedFactKey } = input;
  const { scopeId, scopeTypeKey } = knownFacts;

  let candidates: FollowUpQuestion[] = [];

  if (scopeTypeKey === "Deck") {
    candidates = deckFollowUps(
      knownFacts,
      scopeId,
      scopeTypeKey,
      changedFactKey
    );
  } else if (scopeTypeKey === "Retaining Wall") {
    candidates = retainingWallFollowUps(knownFacts, scopeId, scopeTypeKey);
  } else if (scopeTypeKey === "Bathroom renovation") {
    candidates = bathroomFollowUps(knownFacts, scopeId, scopeTypeKey);
  } else if (scopeTypeKey === "Fence") {
    candidates = fenceFollowUps(knownFacts, scopeId, scopeTypeKey);
  }

  candidates.sort((a, b) => b.priority - a.priority);

  return candidates
    .filter(
      (q, idx, arr) =>
        arr.findIndex((x) => x.factKey === q.factKey) === idx
    )
    .slice(0, MAX_FOLLOW_UPS);
}

export function hasKnownElevatedDeck(
  knownFacts: ScopeKnownFactsResult
): boolean {
  return (
    isFactKnown(knownFacts, "deck.level_type") &&
    getKnownFactValue(knownFacts, "deck.level_type") === "elevated"
  );
}
