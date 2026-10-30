import { ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Info, Loader2, Inbox, CheckCircle2 } from "lucide-react";

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: "bg-navy/5 text-navy border-navy/15",
    warning: "bg-review-bg text-review border-review/30",
    danger: "bg-risk-bg text-risk border-risk/30",
    success: "bg-verified-bg text-verified border-verified/30",
  }[variant];
  const Icon = variant === "info" ? Info : variant === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={clsx("flex gap-3 rounded-card border px-4 py-3 text-sm", styles)}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-medium mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink/50 text-sm">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Inbox size={28} className="text-ink/25" />
      <p className="text-sm font-medium text-ink/70">{title}</p>
      {description && <p className="text-xs text-ink/45 max-w-xs">{description}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <AlertTriangle size={28} className="text-risk/60" />
      <p className="text-sm font-medium text-risk">{message}</p>
    </div>
  );
}
