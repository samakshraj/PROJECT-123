import type { ReactNode } from "react";
export function ScreenHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-9 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
          Student workspace
        </p>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
