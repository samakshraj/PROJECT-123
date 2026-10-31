import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const AccountContext = createContext<{
  user: User | null;
  profileId: string | null;
  ready: boolean;
  openSignIn: () => void;
  signOut: () => Promise<void>;
}>({ user: null, profileId: null, ready: false, openSignIn: () => {}, signOut: async () => {} });
export const useStudentAccount = () => useContext(AccountContext);

async function ensureStudentProfile() {
  const profile = await api<{ id: string }>("/profile");
  return profile.id;
}

export function StudentAccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    const handoffCode = new URLSearchParams(window.location.hash.slice(1)).get("handoff");
    let handoffPending = Boolean(handoffCode);
    if (handoffCode)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!active) return;
      setUser(currentUser);
      if (handoffPending) return;
      if (!currentUser) {
        if (!handoffCode) setReady(true);
        return;
      }
      try {
        const id = await ensureStudentProfile();
        setOpen(false);
        if (!active) return;
        setProfileId(id);
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Could not load your student profile.",
          );
      } finally {
        if (active) setReady(true);
      }
    });
    if (handoffCode) {
      const code = handoffCode;
      void (async () => {
        try {
          const { customToken, role } = await api<{ customToken: string; role: string }>(
            "/auth/redeem",
            { method: "POST", body: JSON.stringify({ code }) },
          );
          if (role !== "student")
            throw new Error("This account is assigned to the admin dashboard.");
          const credential = await signInWithCustomToken(firebaseAuth, customToken);
          handoffPending = false;
          const id = await ensureStudentProfile();
          if (active) {
            setUser(credential.user);
            setProfileId(id);
            setOpen(false);
            setReady(true);
          }
        } catch (error) {
          handoffPending = false;
          if (active) {
            setMessage(error instanceof Error ? error.message : "Could not complete sign-in.");
            setReady(true);
          }
        }
      })();
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await firebaseSignOut(firebaseAuth);
    // Clear the local auth state before navigating so the login route's
    // signed-in redirect cannot race the Firebase auth-state callback.
    setUser(null);
    setProfileId(null);
    setReady(true);
    const loginPageUrl = (
      import.meta.env["VITE_LOGIN_PAGE_URL"] || "http://localhost:5173"
    ).replace(/\/$/, "");
    window.location.assign(loginPageUrl);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "forgot") {
        await sendPasswordResetEmail(firebaseAuth, email, {
          url: `${window.location.origin}/reset-password`,
          handleCodeInApp: true,
        });
        setMessage("Check your email for a secure password reset link.");
      } else {
        if (mode === "signup") await createUserWithEmailAndPassword(firebaseAuth, email, password);
        else await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function social() {
    setBusy(true);
    setMessage("");
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign-in could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountContext.Provider
      value={{
        user,
        profileId,
        ready,
        openSignIn: () => {
          setMode("signin");
          setMessage("");
          setOpen(true);
        },
        signOut,
      }}
    >
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogTitle>
            {mode === "signup"
              ? "Create your student account"
              : mode === "forgot"
                ? "Reset your password"
                : "Welcome back"}
          </DialogTitle>
          <DialogDescription>
            {mode === "forgot"
              ? "Receive a secure reset link by email."
              : "Sign in with your Campus Helpdesk account."}
          </DialogDescription>
          <form onSubmit={submit} className="space-y-4">
            <label className="field-label">
              Email
              <input
                className="student-input"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </label>
            {mode !== "forgot" && (
              <label className="field-label">
                Password
                <input
                  className="student-input"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
            )}
            <Button className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>
          {message && (
            <p role="status" className="text-sm text-primary">
              {message}
            </p>
          )}
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={social}
              >
                Continue with Google
              </Button>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setMessage("");
              }}
            >
              {mode === "signup" ? "Already have an account?" : "Create an account"}
            </Button>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setMode(mode === "forgot" ? "signin" : "forgot");
                setMessage("");
              }}
            >
              {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AccountContext.Provider>
  );
}

export function SignInPrompt({ action }: { action: string }) {
  const { openSignIn, ready } = useStudentAccount();
  return (
    <div className="py-20 text-center">
      <p className="mb-5 text-muted-foreground">
        {ready ? `Sign in to ${action}.` : "Loading your account…"}
      </p>
      <Button disabled={!ready} onClick={openSignIn}>
        Sign in
      </Button>
    </div>
  );
}
