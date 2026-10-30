"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { History, PenSquare, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { StudentRecordDetail } from "@/lib/types";
import { FIELD_LABELS, FIELD_ORDER } from "@/lib/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge, ConfidenceBadge, ValidationBadge, AnomalyBadge } from "@/components/ui/Badges";
import { LoadingState, ErrorState, Alert } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<StudentRecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentRecordDetail>(`/api/records/${id}`)
      .then(setRecord)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load record"));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!record) return <LoadingState />;

  const fieldMap = Object.fromEntries(record.fields.map((f) => [f.field_name, f]));
  const warnings = record.validations.filter((v) => v.status !== "PASS");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-ink/45 font-mono mb-1">{record.id}</p>
          <h1 className="font-serif text-2xl text-navy">
            {fieldMap.student_name?.value || "Student Record"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={record.status} />
            <AnomalyBadge level={record.anomaly_level} score={record.anomaly_score} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/audit?record=${record.id}`)}>
            <History size={15} /> Audit
          </Button>
          {record.status === "VERIFIED" && (
            <Link href={`/records/${record.id}/certificate`}>
              <Button variant="secondary">
                <ShieldCheck size={15} /> Certificate
              </Button>
            </Link>
          )}
          {record.status !== "VERIFIED" && (
            <Link href={`/records/${record.id}/verify`}>
              <Button>
                <PenSquare size={15} /> Human Verification
              </Button>
            </Link>
          )}
        </div>
      </div>

      {record.status === "VERIFIED" && (
        <Alert variant="info">
          <span className="inline-flex items-center gap-1.5 font-medium text-verified">
            <ShieldCheck size={15} /> VERIFIED BY AUTHORIZED OFFICER
          </span>
          <span className="ml-1 text-ink/60">
            on {record.verified_at ? new Date(record.verified_at).toLocaleString() : ""}
          </span>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {warnings.map((v) => (
              <div key={v.id} className="flex items-start gap-3 py-1.5">
                <ValidationBadge status={v.status as "WARNING" | "FAIL"} />
                <p className="text-sm text-ink/75">{v.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Extracted Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-line">
          {FIELD_ORDER.map((name) => {
            const f = fieldMap[name];
            if (!f) return null;
            return (
              <div key={name} className="flex items-center justify-between py-2.5 gap-4">
                <span className="text-sm text-ink/55 w-40 shrink-0">{FIELD_LABELS[name]}</span>
                <span className="text-sm text-ink flex-1 truncate">{f.value ?? <em className="text-ink/35">missing</em>}</span>
                <ConfidenceBadge band={f.confidence_band} score={Math.round(f.confidence)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4 text-center">
        <Card>
          <CardContent>
            <p className="text-xl font-serif font-semibold text-navy">{record.overall_confidence}%</p>
            <p className="text-xs text-ink/50 mt-1">Overall Confidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xl font-serif font-semibold text-navy">{record.anomaly_score}/100</p>
            <p className="text-xs text-ink/50 mt-1">Anomaly Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xl font-serif font-semibold text-navy">{record.validations.filter((v) => v.status === "WARNING" || v.status === "FAIL").length}</p>
            <p className="text-xs text-ink/50 mt-1">Open Findings</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
