import { z } from "zod";

export const addProjectTradeSchema = z.object({
  tradeName: z.string().trim().min(1, "Trade name is required.").max(120),
  note: z.string().trim().max(500).optional(),
  projectScopeId: z.string().uuid().optional().nullable(),
});

export const removeProjectTradeSchema = z.object({
  tradeId: z.string().uuid(),
});

export const toggleWorkAreaEstimateSchema = z.object({
  scopeId: z.string().uuid(),
  includeInQuickEstimate: z.boolean(),
});

export const addAssistantWorkAreaSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("template"),
    templateKey: z.enum(["deck", "retaining-wall", "bathroom-renovation"]),
    name: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
  }),
  z.object({
    mode: z.literal("custom"),
    name: z.string().trim().min(1, "Work area name is required.").max(120),
    description: z.string().trim().max(2000).optional(),
    likelyTrade: z.string().trim().max(120).optional(),
  }),
]);
