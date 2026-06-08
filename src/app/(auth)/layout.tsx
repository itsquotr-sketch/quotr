import { AppLogo } from "@/components/layout/app-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 py-8">
        <AppLogo />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-8">{children}</main>
    </div>
  );
}
