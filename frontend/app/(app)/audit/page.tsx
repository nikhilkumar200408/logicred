"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { AuditLogItem } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";

const ACTION_COLORS: Record<string, string> = {
  UPLOAD: "bg-navy/10 text-navy",
  OCR: "bg-navy/10 text-navy",
  EXTRACTION: "bg-navy/10 text-navy",
  VALIDATION: "bg-review-bg text-review",
  EDIT: "bg-review-bg text-review",
  VERIFY: "bg-verified-bg text-verified",
  APPROVE: "bg-verified-bg text-verified",
  REJECT: "bg-risk-bg text-risk",
  MARK_UNRESOLVED: "bg-risk-bg text-risk",
};

export default function AuditPage() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get("record");
  const [logs, setLogs] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = recordId ? `/api/records/${recordId}/audit` : "/api/audit";
    api
      .get<AuditLogItem[]>(path)
      .then(setLogs)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load audit trail"));
  }, [recordId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-navy">Audit Trail</h1>
        <p className="text-sm text-ink/55 mt-1">
          {recordId ? `Full chronological history for record ${recordId.slice(0, 8)}…` : "System-wide activity log."}
        </p>
      </div>

      {error && <ErrorState message={error} />}
      {!error && !logs && <LoadingState />}
      {logs && logs.length === 0 && <EmptyState title="No audit events yet" />}

      {logs && logs.length > 0 && (
        <Card>
          <div className="divide-y divide-line">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-5 py-3.5">
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium w-28 text-center",
                    ACTION_COLORS[log.action] || "bg-line text-ink/60"
                  )}
                >
                  {log.action}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink/80">
                    {log.log_metadata?.field_name ? (
                      <span>
                        Field <span className="font-medium">{String(log.log_metadata.field_name)}</span> changed
                        {log.old_value ? <> from <span className="font-mono">&quot;{log.old_value}&quot;</span></> : ""} to{" "}
                        <span className="font-mono">&quot;{log.new_value}&quot;</span>
                      </span>
                    ) : log.log_metadata?.reason ? (
                      <span>{String(log.log_metadata.reason)}</span>
                    ) : (
                      <span className="text-ink/50">
                        {log.action === "OCR" && "OCR extraction ran on the document."}
                        {log.action === "EXTRACTION" && "AI structured extraction ran on OCR output."}
                        {log.action === "VALIDATION" && "Domain validation rules were evaluated."}
                        {log.action === "UPLOAD" && "Document uploaded."}
                        {["APPROVE", "REJECT", "MARK_UNRESOLVED", "VERIFY"].includes(log.action) &&
                          "Human verification decision recorded."}
                      </span>
                    )}
                  </div>
                  {log.record_id && (
                    <p className="text-[11px] text-ink/35 font-mono mt-0.5">record {log.record_id.slice(0, 8)}…</p>
                  )}
                </div>
                <span className="text-xs text-ink/45 shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
