import { NewSiteVisitForm } from "@/components/site-visits/new-site-visit-form";
import { PageHeader } from "@/components/shared/page-header";

export default function NewSiteVisitPage() {
  return (
    <div>
      <PageHeader
        title="New site visit"
        description="Capture details while you're on site."
        backHref="/site-visits"
      />
      <NewSiteVisitForm />
    </div>
  );
}
