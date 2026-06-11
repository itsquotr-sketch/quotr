import { revalidatePath } from "next/cache";

export function revalidateProjectAssistant(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/assistant-v2`);
}
