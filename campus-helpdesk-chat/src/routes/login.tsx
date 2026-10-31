import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { GraduationCap, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudentAccount } from "@/components/student-account";
import { pageHead } from "@/lib/student-data";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Student sign in", "Sign in to your IIT Kharagpur Campus Helpdesk account."),
  component: Login,
});

function Login() {
  const { user, ready, openSignIn } = useStudentAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && user) void navigate({ to: "/", replace: true });
  }, [ready, user, navigate]);

  return (
    <main className="login-page relative isolate min-h-dvh overflow-hidden px-5 py-10">
      <div className="cloud cloud-1 pointer-events-none" aria-hidden="true" />
      <div className="cloud cloud-2 pointer-events-none" aria-hidden="true" />
      <div className="cloud cloud-3 pointer-events-none" aria-hidden="true" />
      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md flex-col items-center justify-center text-center">
        <div className="panel w-full rounded-3xl p-8 shadow-soft sm:p-10">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <GraduationCap className="h-9 w-9" />
          </div>
          <p className="header-badge mx-auto mt-6 inline-flex items-center rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
            IIT KHARAGPUR
          </p>
          <h1 className="font-display mt-4 text-3xl font-extrabold">Student sign in</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sign in to continue to your campus assistant, tickets, notices, and reminders.
          </p>
          <Button className="mt-7 w-full" onClick={openSignIn} disabled={!ready}>
            <LockKeyhole />
            {ready ? "Sign in to your account" : "Loading account…"}
          </Button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">IIT Kharagpur Campus Helpdesk</p>
      </section>
    </main>
  );
}
