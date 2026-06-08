import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { PageContainer } from "@/components/layout/page-container";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background">
      <DesktopSidebar />

      <div className="flex min-h-dvh flex-col md:pl-64">
        <PageContainer className="flex-1">{children}</PageContainer>
      </div>

      <MobileBottomNav />
    </div>
  );
}
