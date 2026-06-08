import { NewProjectForm } from "@/components/projects/new-project-form";
import { PageHeader } from "@/components/shared/page-header";

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Project"
        description="Capture a new enquiry or opportunity."
        backHref="/projects"
      />
      <NewProjectForm />
    </div>
  );
}
