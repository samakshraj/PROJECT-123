import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GraduationCap, Sparkles } from "lucide-react";
import { auth, googleProvider } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IIT KHARAGPUR — Log in or create an account" },
      { name: "description", content: "Sign in or create your IIT Kharagpur account." },
      { property: "og:title", content: "IIT KHARAGPUR — Log in or create an account" },
      { property: "og:description", content: "Sign in or create your IIT Kharagpur account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const inputCls = "login-input";

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signup = mode === "signup";

  // Email & Password Auth Handler
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      if (signup) {
        await createUserWithEmailAndPassword(auth, email, password);
        setMsg("Account created successfully!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setMsg("Logged in successfully!");
      }

      await redirectToDashboard();
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : "Sign-in could not be completed.");
    }
  };

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setMsg("");
    try {
      await signInWithPopup(auth, googleProvider);
      setMsg("Logged in with Google successfully!");

      await redirectToDashboard();
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : "Google sign-in could not be completed.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="login-card grid w-full max-w-5xl gap-3 rounded-[28px] p-3 md:grid-cols-2">
        <div className="login-visual relative hidden min-h-[580px] flex-col justify-between rounded-[22px] p-8 md:flex">
          <div className="login-dots absolute inset-0 -z-0" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <GraduationCap size={25} />
            </span>
            <div>
              <div className="font-display font-bold">IIT KHARAGPUR</div>
              <div className="text-xs text-muted-foreground">Campus Helpdesk</div>
            </div>
          </div>
          <div className="relative z-10 flex flex-col items-center px-4 text-center">
            <div className="login-orb mb-10 flex h-44 w-44 items-center justify-center rounded-full">
              <img
                src="https://som.iitkgp.ac.in/images/iitlogo_blue.png"
                alt="IIT Kharagpur official logo"
                className="h-28 w-28 rounded-full bg-white p-3 object-contain shadow-lg"
              />
            </div>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/55 px-4 py-1.5 text-xs font-semibold text-primary backdrop-blur">
              <Sparkles size={14} /> Your campus, made easier
            </span>
            <h2 className="font-display text-3xl font-extrabold leading-tight text-foreground">
              Everything you need
              <br />
              for campus life.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Get help with campus questions, keep track of requests, and stay up to date with
              notices.
            </p>
          </div>
          <div className="relative z-10 text-center text-xs text-muted-foreground">
            A warmer, simpler way to get campus support
          </div>
        </div>

        <div className="flex flex-col justify-center px-4 py-9 sm:px-8 md:px-12 md:py-12">
          <div className="mb-8 flex items-center gap-2 md:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap size={22} />
            </span>
            <span className="font-display font-bold">IIT KHARAGPUR</span>
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-primary">
            Welcome to campus
          </p>
          <h1 className="login-title font-display text-[clamp(1.7rem,3vw,2.4rem)] font-extrabold tracking-tight">
            {signup ? "Create an account" : "IIT KHARAGPUR"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {signup ? "Already have an account? " : "Don't have an account? "}
            <button
              onClick={() => {
                setMode(signup ? "login" : "signup");
                setMsg("");
              }}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {signup ? "Log in" : "Sign up"}
            </button>
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {signup && (
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="First name" className={inputCls} />
                <input placeholder="Last name" className={inputCls} />
              </div>
            )}
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <div className="relative">
              <input
                required
                type={show ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls + " pr-12"}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Toggle password"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
            {signup ? (
              <label className="flex items-center gap-3 text-xs">
                <input required type="checkbox" className="h-5 w-5 accent-primary" />I agree to the{" "}
                <a href="#" className="text-accent underline">
                  Terms & Conditions
                </a>
              </label>
            ) : (
              <div className="flex justify-between text-xs">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" />
                  Remember me
                </label>
              </div>
            )}
            <button className="login-primary mt-4 h-12 w-full rounded-xl text-sm font-semibold text-primary-foreground">
              {signup ? "Create account" : "Log in"}
            </button>
            {msg && (
              <p
                role="status"
                className="rounded-xl border border-border bg-accent/60 px-4 py-3 text-center text-sm text-accent-foreground"
              >
                {msg}
              </p>
            )}
          </form>

          <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            Or {signup ? "register" : "log in"} with
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="login-secondary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm"
            >
              <span className="font-bold text-primary">G</span> Continue with Google
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

async function redirectToDashboard() {
  const apiUrl = (import.meta.env["VITE_RAG_API_URL"] || "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Could not find the signed-in account. Please try again.");
  }
  const response = await fetch(`${apiUrl}/auth/handoff`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const result = (await response.json().catch(() => ({}))) as {
    code?: string;
    role?: string;
    detail?: string;
  };
  if (!response.ok)
    throw new Error(
      result.detail ||
        `Sign-in handoff failed (${response.status}). Check that the helpdesk API is running.`,
    );
  if (!result.code || !result.role)
    throw new Error("The sign-in handoff returned an invalid response.");

  const dashboardUrl =
    result.role === "admin"
      ? import.meta.env["VITE_ADMIN_DASHBOARD_URL"]
      : import.meta.env["VITE_STUDENT_DASHBOARD_URL"] || import.meta.env["VITE_DASHBOARD_URL"];
  if (!dashboardUrl) throw new Error(`The ${result.role} dashboard URL is not configured.`);
  const destination = new URL(dashboardUrl);
  destination.hash = new URLSearchParams({ handoff: result.code }).toString();
  window.location.assign(destination.toString());
}
