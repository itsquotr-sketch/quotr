import type {
  DiscoveryProviderMeta,
  DiscoveryRunContext,
  DiscoveryRunOutcome,
} from "@/lib/ai/discovery/types";

export interface DiscoveryProvider {
  readonly meta: DiscoveryProviderMeta;
  discoverProject(context: DiscoveryRunContext): Promise<DiscoveryRunOutcome>;
}
