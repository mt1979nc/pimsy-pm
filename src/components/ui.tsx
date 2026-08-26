import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type {
  Health,
  Priority,
  ProjectStatus,
  TaskStatus,
  Visibility,
  CustomerStatus,
  RiskSeverity,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,20,30,0.04)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-5 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5 text-[12.5px] text-ink-3">{breadcrumb}</div> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:opacity-90",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-red text-white hover:opacity-90",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badges & status
// ---------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "violet";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  green: "bg-green-soft text-green border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  red: "bg-red-soft text-red border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const healthTone: Record<Health, Tone> = { GREEN: "green", YELLOW: "amber", RED: "red" };
const healthLabel: Record<Health, string> = {
  GREEN: "On track",
  YELLOW: "Needs attention",
  RED: "At risk",
};

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge tone={healthTone[health]}>
      <span
        className="size-1.5 rounded-full bg-current"
        aria-hidden
      />
      {healthLabel[health]}
    </Badge>
  );
}

const projectStatusMeta: Record<ProjectStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  ON_HOLD: { label: "On hold", tone: "amber" },
  BLOCKED: { label: "Blocked", tone: "red" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = projectStatusMeta[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const taskStatusMeta: Record<TaskStatus, { label: string; tone: Tone }> = {
  TODO: { label: "To do", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  BLOCKED: { label: "Blocked", tone: "red" },
  IN_REVIEW: { label: "In review", tone: "violet" },
  DONE: { label: "Done", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const m = taskStatusMeta[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const priorityMeta: Record<Priority, { label: string; tone: Tone }> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "neutral" },
  HIGH: { label: "High", tone: "amber" },
  URGENT: { label: "Urgent", tone: "red" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "LOW" || priority === "MEDIUM") return null;
  const m = priorityMeta[priority];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const customerStatusMeta: Record<CustomerStatus, { label: string; tone: Tone }> = {
  PROSPECT: { label: "Prospect", tone: "violet" },
  ONBOARDING: { label: "Onboarding", tone: "brand" },
  LIVE: { label: "Live", tone: "green" },
  AT_RISK: { label: "At risk", tone: "red" },
  CHURNED: { label: "Churned", tone: "neutral" },
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const m = customerStatusMeta[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const severityMeta: Record<RiskSeverity, Tone> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
  CRITICAL: "red",
};

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return (
    <Badge tone={severityMeta[severity]}>
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </Badge>
  );
}

/**
 * The single most important affordance in the product: whether a piece of
 * content is visible to the customer. Rendered everywhere content can be
 * created so nobody has to guess.
 */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: Visibility;
  className?: string;
}) {
  if (visibility === "SHARED") {
    return (
      <Badge tone="brand" className={className}>
        <EyeIcon /> Customer can see
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className={className}>
      <LockIcon /> Internal only
    </Badge>
  );
}

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Avatar({
  name,
  image,
  size = 26,
  className,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image}
        alt={name ?? ""}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      title={name ?? undefined}
    >
      {initials || "?"}
    </span>
  );
}

export function ProgressBar({
  value,
  total,
  tone = "brand",
  className,
}: {
  value: number;
  total: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barColor =
    tone === "green"
      ? "bg-green"
      : tone === "amber"
        ? "bg-amber"
        : tone === "red"
          ? "bg-red"
          : "bg-brand";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <>
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em]",
          tone === "red" && "text-red",
          tone === "amber" && "text-amber",
          tone === "green" && "text-green",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[12.5px] text-ink-3">{hint}</div> : null}
    </>
  );
  const className = cn(
    "block rounded-xl border border-border bg-surface px-4 py-3.5",
    href && "transition-colors hover:border-border-strong hover:bg-surface-2",
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-3">{icon}</div> : null}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}
