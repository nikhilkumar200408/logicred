"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, ApiError, downloadAuthed } from "@/lib/api";
import { BulkSubmission, SubmissionResultItem } from "@/lib/types";
import { FIELD_LABELS } from "@/lib/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { AnomalyBadge } from "@/components/ui/Badges";
import { useAuth } from "@/lib/auth";

const YES_NO = ["No", "Yes"];
const FORM_FIELDS = [
  "apaar_id", "student_name", "student_id", "dob", "gender", "institution_id", "institution_name",
  "program", "branch", "year_of_admission", "admission_category", "approved_intake", "actual_enrolment",
  "nationality", "email", "mobile",
];
const FLAGS = ["supernumerary_seat", "nri_category", "oci_status", "foreign_national", "consent_given"];

export default function StudentUploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkSubmission | null>(null);
  const [single, setSingle] = useState<SubmissionResultItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    nationality: "Indian", supernumerary_seat: "No", nri_category: "No", oci_status: "No",
    foreign_national: "No", consent_given: "Yes",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function uploadCsv() {
    if (!file) return;
    setBusy(true); setError(null); setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setSummary(await api.post<BulkSubmission>("/api/students/upload-csv", fd));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function submitSingle() {
    setBusy(true); setError(null); setSingle(null);
    try {
      setSingle(await api.post<SubmissionResultItem>("/api/students", form));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Submission failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl text-navy">Student Data Upload</h1>
        <p className="text-sm text-ink/55 mt-1">
          Submit student-level admission data keyed by APAAR ID
          {user?.institution_name ? ` for ${user.institution_name}` : ""}. Every row is validated on arrival.
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>Bulk upload (CSV)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            <Button onClick={uploadCsv} disabled={!file || busy}>
              <UploadCloud size={15} /> {busy ? "Validating…" : "Upload & Validate"}
            </Button>
            <Button variant="secondary" onClick={() => downloadAuthed("/api/students/template.csv", "logicred_student_template.csv")}>
              <Download size={15} /> CSV template
            </Button>
          </div>
          <p className="text-xs text-ink/45">
            Columns: {Object.keys(FIELD_LABELS).join(", ")}. System integrations can POST the same rows as JSON to
            <code className="mx-1">/api/students/bulk</code>.
          </p>

          {summary && (
            <div className="space-y-3">
              <Alert variant={summary.flagged ? "warning" : "success"}>
                {summary.total} rows processed — {summary.accepted_clean} clean, {summary.flagged} flagged for review.
              </Alert>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy/5 text-left text-xs text-ink/55 uppercase tracking-wide">
                      <th className="px-3 py-2">Row</th><th className="px-3 py-2">APAAR ID</th>
                      <th className="px-3 py-2">Student</th><th className="px-3 py-2">Risk</th>
                      <th className="px-3 py-2">Issues</th><th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.map((r) => (
                      <tr key={r.record_id} className="border-t border-line align-top">
                        <td className="px-3 py-2">{r.row}</td>
                        <td className="px-3 py-2 font-mono">{r.apaar_id || "—"}</td>
                        <td className="px-3 py-2">{r.student_name || "—"}</td>
                        <td className="px-3 py-2"><AnomalyBadge level={r.anomaly_level} score={0} /></td>
                        <td className="px-3 py-2 text-xs text-ink/70">
                          {r.issues.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-verified"><CheckCircle2 size={13} /> No issues</span>
                          ) : (
                            <ul className="space-y-1">{r.issues.map((i, k) => (
                              <li key={k} className="flex gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5 text-review" />{i}</li>
                            ))}</ul>
                          )}
                        </td>
                        <td className="px-3 py-2"><Link className="text-accent text-xs" href={`/records/${r.record_id}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Single student entry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {FORM_FIELDS.map((f) => (
              <div key={f}>
                <Label>{FIELD_LABELS[f]}</Label>
                <Input value={form[f] || ""} onChange={(e) => set(f, e.target.value)}
                  placeholder={f === "apaar_id" ? "12-digit APAAR ID" : f === "dob" ? "DD-MM-YYYY" : ""} />
              </div>
            ))}
            {FLAGS.map((f) => (
              <div key={f}>
                <Label>{FIELD_LABELS[f]}</Label>
                <Select value={form[f]} onChange={(e) => set(f, e.target.value)}>
                  {YES_NO.map((o) => <option key={o}>{o}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={submitSingle} disabled={busy}>Submit student</Button>
          {single && (
            <Alert variant={single.issues.length ? "warning" : "success"}>
              {single.issues.length === 0 ? "Record accepted with no issues." : single.issues.join(" • ")}{" "}
              <Link className="underline" href={`/records/${single.record_id}`}>Open record</Link>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
