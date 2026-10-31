import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { pageHead } from "@/lib/student-data";
export const Route = createFileRoute("/reset-password")({
  head: () => pageHead("Reset password", "Set a new password for your Campus Helpdesk account."),
  component: ResetPassword,
});
function ResetPassword() {
  const [valid, setValid] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const actionCode = new URLSearchParams(window.location.search).get("oobCode");
  useEffect(() => {
    if (!actionCode) {
      setReady(true);
      return;
    }
    void verifyPasswordResetCode(firebaseAuth, actionCode)
      .then(() => setValid(true))
      .catch(() => setValid(false))
      .finally(() => setReady(true));
  }, [actionCode]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || !actionCode) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== form.get("confirm")) {
      setMessage("The passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(firebaseAuth, actionCode, password);
      setDone(true);
      window.history.replaceState(null, "", "/reset-password");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update password.");
    }
    setBusy(false);
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-4 font-display text-3xl font-bold">
        {done ? "Password updated" : "Reset password"}
      </h1>
      {!ready ? (
        <p>Checking reset link…</p>
      ) : done ? (
        <p className="text-muted-foreground">Your new password is ready to use.</p>
      ) : !valid ? (
        <p className="text-muted-foreground">
          This reset link is invalid or has expired. Request a new link from your profile or the
          sign-in window.
        </p>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <label className="field-label">
            New password
            <input
              className="student-input"
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <label className="field-label">
            Confirm password
            <input
              className="student-input"
              type="password"
              name="confirm"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <Button disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
      )}
      {message && (
        <p role="alert" className="mt-4 text-destructive">
          {message}
        </p>
      )}
      <Button asChild variant="link" className="mt-5 justify-start px-0">
        <Link to="/">Back to Campus Helpdesk</Link>
      </Button>
    </main>
  );
}
