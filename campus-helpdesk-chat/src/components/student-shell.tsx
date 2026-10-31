import { Link, useLocation } from "@tanstack/react-router";
import {
  GraduationCap,
  Sparkles,
  Bell,
  Ticket,
  CalendarClock,
  UserRound,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useStudentAccount } from "./student-account";
import { useQuery } from "@tanstack/react-query";
import { profileOptions } from "@/lib/student-data";

const items = [
  { to: "/", label: "AI chat", icon: Sparkles, note: "Your campus assistant" },
  { to: "/notices", label: "Notice board", icon: Bell, note: "Campus announcements" },
  { to: "/tickets", label: "Tickets & requests", icon: Ticket, note: "We’re here to help" },
  { to: "/reminders", label: "Reminders", icon: CalendarClock, note: "Stay one step ahead" },
  { to: "/profile", label: "My profile", icon: UserRound, note: "Your student details" },
] as const;

export function StudentShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, profileId, openSignIn, signOut } = useStudentAccount();
  const profileQuery = useQuery({
    ...profileOptions(profileId ?? ""),
    enabled: Boolean(user && profileId),
  });
  const savedName = profileQuery.data?.full_name?.trim();
  const authName = user?.displayName?.trim();
  const studentName = savedName || (profileQuery.isError ? authName : "") || "Student account";
  const initial = (studentName === "Student account" ? user?.email || "S" : studentName)
    .slice(0, 1)
    .toUpperCase();
  if (pathname === "/reset-password" || pathname === "/login") return <>{children}</>;
  return (
    <div className="student-workspace">
      <div className="clouds" aria-hidden="true">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
        <div className="cloud cloud-4" />
      </div>
      <aside className="student-sidebar">
        <Link to="/" className="mb-12 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap size={25} />
          </span>
          <span className="font-display text-sm font-bold leading-tight tracking-wide">
            IIT KHARAGPUR
            <span className="block text-xs font-medium tracking-normal text-muted-foreground">
              Student helpdesk
            </span>
          </span>
        </Link>
        <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sidebar-caption">
          Your workspace
        </p>
        <nav aria-label="Student navigation" className="space-y-2">
          {items.map(({ to, label, icon: Icon, note }) => (
            <Button
              key={to}
              asChild
              variant="ghost"
              className="student-nav h-auto justify-start px-3 py-3"
            >
              <Link
                to={to}
                activeOptions={{ exact: true }}
                activeProps={{ className: "student-nav-active" }}
              >
                <Icon className="size-5" />
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="nav-note block text-[10px] font-normal text-muted-foreground">
                    {note}
                  </span>
                </span>
              </Link>
            </Button>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-5 sidebar-account">
          {user ? (
            <>
              <Link to="/profile" className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary">
                  {initial}
                </span>
                <span className="truncate text-sm font-semibold">{studentName}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-muted-foreground"
                onClick={signOut}
              >
                <LogOut />
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="outline" className="w-full" onClick={openSignIn}>
              <UserRound />
              Student sign in
              <ArrowUpRight />
            </Button>
          )}
        </div>
      </aside>
      <div className="student-main">{children}</div>
    </div>
  );
}
