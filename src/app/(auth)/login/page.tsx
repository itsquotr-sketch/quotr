import { SignInForm } from "@/components/auth/sign-in-form";

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">
        Sign in to manage projects, scopes and quotes.
      </p>
      <div className="mt-8">
        <SignInForm />
      </div>
    </div>
  );
}
