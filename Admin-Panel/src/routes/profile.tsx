import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import {
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  UserPlus,
  Users,
  UserRound,
} from "lucide-react";
import { PageHeader, inputCls } from "@/components/AdminSidebar";
import { api } from "@/lib/api";
import { adminAuth } from "@/lib/firebase";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — IIT KGP Helpdesk" },
      { name: "description", content: "Manage helpdesk student and administrator accounts." },
    ],
  }),
  component: Profile,
});

type ManagedUser = {
  uid: string;
  email: string;
  full_name: string;
  student_id: string;
  role: "admin" | "student";
};
type OwnProfile = {
  id: string;
  full_name: string;
  student_id: string;
  department: string;
  course: string;
  year: string;
  phone: string;
};

function Profile() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [resetUid, setResetUid] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentUser, setCurrentUser] = useState(adminAuth.currentUser);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [newOwnPassword, setNewOwnPassword] = useState("");
  const [confirmOwnPassword, setConfirmOwnPassword] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api<ManagedUser[]>("/admin/users"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(adminAuth, (user) => {
        setCurrentUser(user);
        if (!user) {
          setUsers([]);
          setProfile(null);
          setLoading(false);
          setError("Sign in as an administrator to manage accounts.");
          return;
        }
        void loadUsers();
        void api<OwnProfile>("/profile")
          .then(setProfile)
          .catch((e: unknown) =>
            setProfileMessage(e instanceof Error ? e.message : "Could not load your profile."),
          );
      }),
    [loadUsers],
  );

  const run = async (
    key: string,
    success: string,
    action: () => Promise<unknown>,
  ): Promise<boolean> => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await loadUsers();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account action failed.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const addStudent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("student", "Student account created.", () =>
      api("/admin/students", {
        method: "POST",
        body: JSON.stringify({
          full_name: studentName,
          email: studentEmail,
          password: studentPassword,
        }),
      }),
    ).then((ok) => {
      if (ok) {
        setStudentName("");
        setStudentEmail("");
        setStudentPassword("");
      }
    });
  };
  const addAdmin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(
      "admin",
      "Administrator access added. They can sign in using their account credentials.",
      () =>
        api("/admin/admins", {
          method: "POST",
          body: JSON.stringify({
            email: adminEmail,
            ...(adminPassword ? { password: adminPassword } : {}),
          }),
        }),
    ).then((ok) => {
      if (ok) {
        setAdminEmail("");
        setAdminPassword("");
      }
    });
  };
  const resetPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const uid = resetUid;
    void run(
      `reset-${uid}`,
      "Password reset successfully. The account will need to sign in again.",
      () =>
        api(`/admin/users/${encodeURIComponent(uid)}/password`, {
          method: "POST",
          body: JSON.stringify({ password: newPassword }),
        }),
    ).then((ok) => {
      if (ok) {
        setResetUid("");
        setNewPassword("");
      }
    });
  };

  const saveOwnProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      ["full_name", "student_id", "department", "phone"].map((field) => [
        field,
        String(form.get(field) || "").trim(),
      ]),
    );
    Object.assign(values, { course: profile?.course || "", year: profile?.year || "" });
    setProfileBusy(true);
    setProfileMessage("");
    try {
      const saved = await api<OwnProfile>("/profile", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setProfile(saved);
      if (adminAuth.currentUser)
        await updateProfile(adminAuth.currentUser, { displayName: saved.full_name });
      window.dispatchEvent(new Event("admin-profile-updated"));
      setProfileMessage("Your profile details were saved.");
    } catch (e) {
      setProfileMessage(e instanceof Error ? e.message : "Could not save profile details.");
    } finally {
      setProfileBusy(false);
    }
  };

  const updateOwnPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newOwnPassword.length < 8) {
      setProfileMessage("Use a password with at least 8 characters.");
      return;
    }
    if (newOwnPassword !== confirmOwnPassword) {
      setProfileMessage("The passwords do not match.");
      return;
    }
    if (!currentUser) {
      setProfileMessage("Sign in again before changing your password.");
      return;
    }
    setProfileBusy(true);
    setProfileMessage("");
    try {
      await api(`/admin/users/${encodeURIComponent(currentUser.uid)}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newOwnPassword }),
      });
      setNewOwnPassword("");
      setConfirmOwnPassword("");
      setProfileMessage("Your password was updated successfully.");
    } catch (e) {
      setProfileMessage(e instanceof Error ? e.message : "Could not update your password.");
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        badge="My Profile"
        title="Account management"
        sub="Manage student access, administrator accounts, and account passwords."
      />
      <section className="panel mt-5 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <UserRound className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Admin access
            </p>
            <p className="font-semibold">
              {profile?.full_name || currentUser?.displayName || "Administrator"}
            </p>
          </div>
          <Shield className="ml-auto h-5 w-5 text-primary" />
        </div>
        <form onSubmit={saveOwnProfile} className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { key: "full_name", label: "Full name" },
              { key: "student_id", label: "Staff / institute ID" },
              { key: "department", label: "Department" },
              { key: "phone", label: "Phone number" },
            ] as const
          ).map((field) => (
            <label key={field.key} className="space-y-1 text-sm font-medium">
              {field.label}
              <input
                className={inputCls}
                name={field.key}
                defaultValue={profile?.[field.key] || ""}
                required={field.key === "full_name"}
                maxLength={120}
                key={`${profile?.id || "new"}-${field.key}`}
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button className="admin-button" disabled={profileBusy}>
              <Save className="h-4 w-4" /> Save my details
            </button>
          </div>
        </form>
        <form
          onSubmit={updateOwnPassword}
          className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <h2 className="font-display font-bold">Update password</h2>
            <p className="text-sm text-muted-foreground">
              Choose and save a new password here. No email link is needed.
            </p>
          </div>
          <label className="space-y-1 text-sm font-medium">
            New password
            <input
              className={inputCls}
              type="password"
              autoComplete="new-password"
              value={newOwnPassword}
              onChange={(e) => setNewOwnPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Confirm new password
            <input
              className={inputCls}
              type="password"
              autoComplete="new-password"
              value={confirmOwnPassword}
              onChange={(e) => setConfirmOwnPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <div className="sm:col-span-2">
            <button className="admin-button" disabled={profileBusy}>
              {profileBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}{" "}
              Update password
            </button>
          </div>
        </form>
        {profileMessage && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {profileMessage}
          </p>
        )}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <form onSubmit={addStudent} className="panel space-y-3 p-5">
          <div className="mb-2 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Add student</h2>
          </div>
          <input
            className={inputCls}
            placeholder="Student full name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            required
            maxLength={120}
          />
          <input
            className={inputCls}
            type="email"
            placeholder="Student email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            required
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Temporary password (8+ characters)"
            value={studentPassword}
            onChange={(e) => setStudentPassword(e.target.value)}
            required
            minLength={8}
          />
          <button className="admin-button" disabled={busy !== ""}>
            <Plus className="h-4 w-4" /> Create student account
          </button>
        </form>

        <form onSubmit={addAdmin} className="panel space-y-3 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Add administrator</h2>
          </div>
          <input
            className={inputCls}
            type="email"
            placeholder="Administrator email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Password if creating a new account (optional for existing)"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            minLength={adminPassword ? 8 : undefined}
          />
          <p className="text-xs text-muted-foreground">
            An existing account is promoted. New accounts require a password of at least 8
            characters.
          </p>
          <button className="admin-button" disabled={busy !== ""}>
            <Plus className="h-4 w-4" /> Grant administrator access
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-success">
          {notice}
        </p>
      )}

      <section className="panel mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Accounts</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{users.length}</span>
          </div>
          <button
            type="button"
            className="admin-button"
            onClick={() => void loadUsers()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </p>
        ) : users.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No accounts are registered yet.
          </p>
        ) : (
          <div className="divide-y">
            {users.map((account) => (
              <div key={account.uid} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  {account.role === "admin" ? (
                    <Shield className="h-5 w-5" />
                  ) : (
                    <Users className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {account.full_name ||
                      (account.role === "admin"
                        ? "Administrator"
                        : account.email || "Unnamed account")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.role === "admin" ? "Admin access" : account.email}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">
                  {account.role}
                </span>
                {resetUid === account.uid ? (
                  <form
                    onSubmit={resetPassword}
                    className="flex w-full flex-wrap items-center gap-2 pl-0 sm:w-auto sm:pl-2"
                  >
                    <input
                      className={`${inputCls} min-w-48 flex-1 sm:w-52`}
                      type="password"
                      placeholder="New password (8+ chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                    />
                    <button className="admin-button" disabled={busy === `reset-${account.uid}`}>
                      {busy === `reset-${account.uid}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}{" "}
                      Reset
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        setResetUid("");
                        setNewPassword("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Reset password"
                    aria-label={`Reset password for ${account.email}`}
                    onClick={() => {
                      setResetUid(account.uid);
                      setNewPassword("");
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                )}
                {account.role === "student" && (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove student"
                    aria-label={`Remove ${account.email}`}
                    disabled={busy !== ""}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove student account ${account.email}? Their profile and chat history will be deleted.`,
                        )
                      )
                        void run(`remove-${account.uid}`, "Student account removed.", () =>
                          api(`/admin/students/${encodeURIComponent(account.uid)}`, {
                            method: "DELETE",
                          }),
                        );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
