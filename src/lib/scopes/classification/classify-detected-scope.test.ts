import { describe, expect, it } from "vitest";
import { classifyDetectedScope } from "@/lib/scopes/classification/classify-detected-scope";
import { applyClassificationToDiscoveryResult } from "@/lib/scopes/classification/process-discovery-items";
import { getWorkAreaDisplayInfo } from "@/lib/scopes/classification/display-work-area";
import type { DiscoveryWorkArea } from "@/lib/ai/discovery/types";
import type { ProjectScope } from "@/types/database";

function workArea(
  typeKey: string,
  name: string,
  confidence = 0.7
): DiscoveryWorkArea {
  return {
    typeKey,
    name,
    description: "",
    locationArea: null,
    confidence,
    matchedKeywords: [],
  };
}

describe("Sprint 10C — scope classification QA", () => {
  it("Test A — Bathroom only: no Internal Alteration work area", () => {
    const notes =
      "Bathroom renovation, 7m², new vanity, shower, toilet and door. Tile floor and shower walls.";
    const { workAreas, processed } = applyClassificationToDiscoveryResult(
      [
        workArea("Bathroom renovation", "Bathroom renovation", 0.85),
        workArea("Internal Alteration", "Internal alteration", 0),
      ],
      notes
    );

    expect(workAreas.some((w) => w.typeKey === "Bathroom renovation")).toBe(true);
    expect(workAreas.some((w) => w.name.toLowerCase().includes("internal"))).toBe(
      false
    );
    expect(processed.broadCategories.length).toBe(0);
  });

  it("Test B — Bathroom + internal works: packages not broad 0% scope", () => {
    const notes =
      "Bathroom renovation plus remove a non-load-bearing wall and repaint hallway.";
    const { workAreas, processed } = applyClassificationToDiscoveryResult(
      [
        workArea("Bathroom renovation", "Bathroom renovation", 0.85),
        workArea("Internal Alteration", "Internal alteration", 0),
      ],
      notes
    );

    expect(workAreas).toHaveLength(1);
    expect(workAreas[0]?.typeKey).toBe("Bathroom renovation");
    expect(
      processed.heldPackages.some((p) => p.packageKey === "demolition")
    ).toBe(true);
    expect(
      processed.heldPackages.some((p) => p.packageKey === "painting")
    ).toBe(true);
    expect(processed.broadCategories.length).toBe(0);
  });

  it("Test C — Vague internal alteration: broad category, no work area", () => {
    const notes = "Need some internal alteration work done.";
    const { workAreas, processed } = applyClassificationToDiscoveryResult(
      [workArea("Internal Alteration", "Internal alteration", 0)],
      notes
    );

    expect(workAreas).toHaveLength(0);
    expect(processed.broadCategories.length).toBeGreaterThan(0);
    expect(processed.broadCategories[0]?.displayLabel).toMatch(
      /additional internal works/i
    );

    const classified = classifyDetectedScope("internal alteration");
    expect(classified.classification).toBe("broad_category");
  });

  it("Test D — Explains internal alteration in plain language", () => {
    const classified = classifyDetectedScope("What is internal alteration?");
    expect(classified.classification).toBe("broad_category");
    expect(classified.reason).toMatch(/too broad/i);
  });

  it("Test E — Legacy 0% internal alteration displays as needs clarification", () => {
    const scope = {
      id: "1",
      project_id: "p",
      organisation_id: "o",
      scope_type_id: null,
      name: "Internal alteration",
      description: null,
      location_area: null,
      notes: null,
      status: "draft",
      ai_status: "not_started",
      ai_confidence: 0,
      confidence_level: "low",
      estimate_status: "draft",
      is_custom: false,
      include_in_quick_estimate: true,
      classification_status: "confirmed",
      sort_order: 0,
      created_at: "",
      updated_at: "",
      scope_types: { name: "Internal alteration" },
    } as ProjectScope & { scope_types: { name: string } };

    const display = getWorkAreaDisplayInfo(scope);
    expect(display.displayName).toBe("Additional internal works");
    expect(display.statusLabel).toBe("Needs clarification");
    expect(display.showConfidence).toBe(false);
  });

  it("classifies work packages absorbed by bathroom", () => {
    const result = classifyDetectedScope("tiling", {
      parentWorkAreaKeys: ["bathroom_renovation"],
    });
    expect(result.classification).toBe("work_package");
    expect(result.canonicalKey).toBe("tiling");
  });

  it("deck does not create separate landscaping work area", () => {
    const notes = "Build a timber deck 4m x 5m";
    const { workAreas } = applyClassificationToDiscoveryResult(
      [
        workArea("Deck", "Deck", 0.8),
        workArea("Landscaping", "Landscaping", 0.3),
      ],
      notes
    );
    expect(workAreas.some((w) => w.typeKey === "Deck")).toBe(true);
    expect(workAreas.some((w) => w.name === "Landscaping")).toBe(false);
  });
});
