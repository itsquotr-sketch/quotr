import { Calculator, FileText, Send } from "lucide-react";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";

interface AssistantV2DownstreamSectionsProps {
  rfqCount?: number;
}

export function AssistantV2DownstreamSections({
  rfqCount = 0,
}: AssistantV2DownstreamSectionsProps) {
  return (
    <div className="space-y-4">
      <SectionPlaceholder
        title="Detailed Estimate"
        description="Line-item build-up from your quick estimate — coming in the next release."
        icon={Calculator}
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">RFQs</h2>
          {rfqCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
              {rfqCount}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Request subcontractor pricing once your scope is confirmed.
        </p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </p>
      </div>

      <SectionPlaceholder
        title="Quote"
        description="Build and send a client quote from your estimate."
        icon={FileText}
      />
    </div>
  );
}
