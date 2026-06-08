import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Use narrower max-width for form-focused pages */
  variant?: "default" | "form" | "full";
}

export function PageContainer({
  children,
  className,
  variant = "default",
}: PageContainerProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 pb-24 md:px-6 md:pb-8 lg:px-8",
        variant === "default" && "max-w-7xl",
        variant === "form" && "max-w-2xl",
        className
      )}
    >
      {children}
    </main>
  );
}
