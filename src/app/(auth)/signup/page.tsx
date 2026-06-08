import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-muted-foreground">
        Start capturing site visits and turning them into quotes.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
    </div>
  );
}
