import clsx from "clsx";
import { CheckCircle2, AlertTriangle, ShieldAlert, XCircle, Clock, HelpCircle } from "lucide-react";

export function ConfidenceBadge({ band, score }: { band: "HIGH" | "REVIEW" | "VERIFY"; score?: number }) {
  const styles: Record<string, string> = {
    HIGH: "bg-verified-bg text-verified",
    REVIEW: "bg-review-bg text-review",
    VERIFY: "bg-risk-bg text-risk",
  };
  const labels: Record<string, string> = { HIGH: "High", REVIEW: "Review", VERIFY: "Verify" };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        styles[band]
      )}
    >
      {labels[band]}
      {typeof score === "number" && <span className="opacity-70">{score}%</span>}
    </span>
  );
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PENDING_REVIEW: { label: "Pending Review", className: "bg-review-bg text-review", icon: Clock },
  AUTO_PASSED: { label: "Auto-Passed", className: "bg-verified-bg text-verified", icon: CheckCircle2 },
  VERIFIED: { label: "Verified", className: "bg-verified-bg text-verified", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", className: "bg-risk-bg text-risk", icon: XCircle },
  UNRESOLVED: { label: "Unresolved", className: "bg-risk-bg text-risk", icon: HelpCircle },
  UPLOADED: { label: "Uploaded", className: "bg-line text-navy", icon: Clock },
  PROCESSING: { label: "Processing", className: "bg-review-bg text-review", icon: Clock },
  PROCESSED: { label: "Processed", className: "bg-verified-bg text-verified", icon: CheckCircle2 },
  FAILED: { label: "Failed", className: "bg-risk-bg text-risk", icon: XCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: "bg-line text-navy", icon: HelpCircle };
  const Icon = cfg.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", cfg.className)}>
      <Icon size={13} strokeWidth={2.2} />
      {cfg.label}
    </span>
  );
}

export function ValidationBadge({ status }: { status: "PASS" | "WARNING" | "FAIL" }) {
  const cfg = {
    PASS: { label: "Pass", className: "bg-verified-bg text-verified", icon: CheckCircle2 },
    WARNING: { label: "Warning", className: "bg-review-bg text-review", icon: AlertTriangle },
    FAIL: { label: "Fail", className: "bg-risk-bg text-risk", icon: ShieldAlert },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", cfg.className)}>
      <Icon size={13} strokeWidth={2.2} />
      {cfg.label}
    </span>
  );
}

export function AnomalyBadge({ level, score }: { level: "LOW" | "MEDIUM" | "HIGH"; score: number }) {
  const styles: Record<string, string> = {
    LOW: "bg-verified-bg text-verified",
    MEDIUM: "bg-review-bg text-review",
    HIGH: "bg-risk-bg text-risk",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", styles[level])}>
      {score}/100 — {level.charAt(0) + level.slice(1).toLowerCase()}
    </span>
  );
}
