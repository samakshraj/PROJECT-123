import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { adminAuth, adminGoogleProvider } from "@/lib/firebase";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Sparkles,
  Bell,
  Ticket,
  FileText,
  GraduationCap,
  LogOut,
  UserRound,
} from "lucide-react";

const items = [
  { to: "/", title: "Dashboard", sub: "Overview & insights", icon: LayoutDashboard },
  { to: "/ai-chat", title: "AI Chat", sub: "Test campus answers", icon: Sparkles },
  { to: "/notices", title: "Notice board", sub: "Manage announcements", icon: Bell },
  { to: "/tickets", title: "Ticket management", sub: "Student requests", icon: Ticket },
  { to: "/documents", title: "Documents", sub: "RAG knowledge base", icon: FileText },
] as const;

export function AdminSidebar() {
  const [user, setUser] = useState(adminAuth.currentUser);
  const [adminName, setAdminName] = useState(adminAuth.currentUser?.displayName || "Administrator");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const signOutToLogin = async () => {
    setError("");
    try {
      await signOut(adminAuth);
      const loginPageUrl = (
        import.meta.env["VITE_LOGIN_PAGE_URL"] || "http://localhost:5173"
      ).replace(/\/$/, "");
      window.location.assign(loginPageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  };
  useEffect(() => {
    let active = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("handoff");
    if (code)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const syncAdminProfile = () => {
      const current = adminAuth.currentUser;
      setAdminName(current?.displayName || "Administrator");
      if (current)
        void api<{ full_name?: string }>("/profile")
          .then((profile) =>
            setAdminName(profile.full_name || current.displayName || "Administrator"),
          )
          .catch(() => {});
    };
    const unsubscribe = onAuthStateChanged(adminAuth, (current) => {
      setUser(current);
      syncAdminProfile();
    });
    window.addEventListener("admin-profile-updated", syncAdminProfile);
    if (code)
      void api<{ customToken: string; role: string }>("/auth/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      })
        .then(async ({ customToken, role }) => {
          if (role !== "admin")
            throw new Error("This account is assigned to the student dashboard.");
          await signInWithCustomToken(adminAuth, customToken);
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : "Could not complete sign-in.");
        });
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("admin-profile-updated", syncAdminProfile);
    };
  }, []);
  return (
    <aside className="admin-sidebar panel">
      <div className="admin-brand mb-12 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div className="admin-brand-copy min-w-0">
          <div className="font-display text-sm font-bold leading-tight tracking-wide">
            IIT KHARAGPUR
          </div>
          <div className="text-xs font-medium text-muted-foreground">Admin helpdesk</div>
        </div>
      </div>
      <div className="admin-sidebar-caption mb-4 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Admin workspace
      </div>
      <nav aria-label="Admin navigation" className="flex flex-col gap-2">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            activeOptions={{ exact: true }}
            className="admin-nav-link group flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <span className="admin-nav-icon">
              <it.icon className="h-5 w-5" />
            </span>
            <div className="admin-nav-copy min-w-0">
              <div className="font-semibold">{it.title}</div>
              <div className="text-[10px] text-muted-foreground">{it.sub}</div>
            </div>
          </Link>
        ))}
      </nav>
      <Link
        to="/profile"
        activeOptions={{ exact: true }}
        className="admin-nav-link group mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5"
        aria-label="My Profile"
      >
        <span className="admin-nav-icon">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="admin-nav-copy min-w-0">
          <div className="font-semibold">My Profile</div>
          <div className="text-[10px] text-muted-foreground">Manage accounts</div>
        </div>
      </Link>
      <div className="admin-account border-t border-border pt-5">
        <div className="flex min-w-0 items-center gap-3 px-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">
            {user?.email?.slice(0, 1).toUpperCase() || "A"}
          </div>
          <div className="admin-account-copy min-w-0">
            <div className="max-w-full truncate text-sm font-semibold">
              {user ? adminName : "Admin sign in required"}
            </div>
            <div className="text-xs text-muted-foreground">
              {user ? "Admin access" : "Administrator"}
            </div>
          </div>
        </div>
        {user ? (
          <button
            onClick={() => void signOutToLogin()}
            className="mt-3 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> <span className="admin-account-copy">Sign out</span>
          </button>
        ) : (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              void signInWithEmailAndPassword(adminAuth, email, password).catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Sign in failed"),
              );
            }}
          >
            <input
              className="admin-input"
              type="email"
              placeholder="Admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="admin-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="admin-button w-full" type="submit">
              Sign in
            </button>
            <button
              type="button"
              onClick={() =>
                void signInWithPopup(adminAuth, adminGoogleProvider).catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : "Sign in failed"),
                )
              }
              className="w-full rounded-xl border bg-card/70 px-3 py-2 text-sm transition hover:bg-accent"
            >
              Continue with Google
            </button>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </aside>
  );
}

export function PageHeader({
  badge,
  title,
  sub,
  children,
}: {
  badge: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-soft">
          <GraduationCap className="h-4 w-4 text-primary" /> {badge}
        </span>
        <h1 className="text-gold font-display mt-3 text-3xl font-extrabold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export const btnGold = "admin-button";
export const inputCls = "admin-input";
