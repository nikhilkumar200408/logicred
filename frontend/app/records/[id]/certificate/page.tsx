"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Printer, ArrowLeft } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { StudentRecordDetail } from "@/lib/types";
import { FIELD_LABELS, FIELD_ORDER } from "@/lib/fields";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

/**
 * Printable Digital Verification Certificate for a VERIFIED land record.
 * Standalone route (no app sidebar/topbar) so "Print / Save as PDF" produces
 * a clean single-page document — the browser's native print-to-PDF is the
 * export mechanism, no extra PDF library needed.
 */
export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<StudentRecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentRecordDetail>(`/api/records/${id}`)
      .then((r) => {
        if (r.status !== "VERIFIED") {
          setError("A certificate is only available for records that have been verified and digitally signed.");
          return;
        }
        setRecord(r);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load record"));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!record) return <LoadingState />;

  const fieldMap = Object.fromEntries(record.fields.map((f) => [f.field_name, f]));

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-sm text-ink/60 hover:text-navy flex items-center gap-1.5">
          <ArrowLeft size={15} /> Back
        </button>
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Print / Save as PDF
        </Button>
      </div>

      <div className="max-w-2xl mx-auto bg-white border-2 border-navy/15 rounded-card shadow-elevated p-10 print:shadow-none print:border-none">
        <div className="flex items-center justify-between border-b border-line pb-5 mb-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-accent" />
            <div>
              <p className="font-serif font-semibold text-navy">LogicRed</p>
              <p className="text-[11px] text-ink/45">Verified Student Record Certificate (APAAR-linked)</p>
            </div>
          </div>
          <p className="text-[11px] font-mono text-ink/40">{record.id}</p>
        </div>

        <h1 className="font-serif text-xl text-navy mb-1">{fieldMap.student_name?.value || "Student Record"}</h1>
        <p className="text-sm font-mono text-navy mb-1" data-testid="apaar-student-line">
          APAAR ID: {fieldMap.apaar_id?.value || "—"} &nbsp;|&nbsp; Student ID: {fieldMap.student_id?.value || "—"}
        </p>
        <p className="text-xs text-verified font-medium mb-6">VERIFIED &amp; DIGITALLY SIGNED</p>

        <table className="w-full text-sm mb-6">
          <tbody>
            {FIELD_ORDER.map((name) => (
              <tr key={name} className="border-b border-line/60">
                <td className="py-2 pr-4 text-ink/50 w-1/3">{FIELD_LABELS[name] || name}</td>
                <td className="py-2 text-navy font-medium">{fieldMap[name]?.value || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-line pt-5 space-y-1.5 text-xs text-ink/55">
          <p>Verified on: {record.verified_at ? new Date(record.verified_at).toLocaleString() : "—"}</p>
          <p>Overall confidence at verification: {record.overall_confidence}%</p>
          {record.signature_hash && (
            <p className="font-mono break-all">Signature hash (SHA-256): {record.signature_hash}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line mt-5 pt-5">
          <p className="text-[10px] text-ink/40 max-w-[70%]">
            Scan to verify this certificate online — confirms the signature hash directly against the
            LogicRed audit trail.
          </p>
          {typeof window !== "undefined" && (
            <QRCodeSVG
              value={`${window.location.origin}/verify-certificate/${record.id}`}
              size={84}
              level="M"
            />
          )}
        </div>

        <p className="text-[10px] text-ink/35 mt-6 border-t border-line pt-4">
          This certificate reflects a student enrolment record as verified by an authorized AICTE Officer. The APAAR ID and
          Student ID printed above are the identifiers degree-awarding bodies should print on issued certificates. Automated checks flag potential inconsistencies only. Verify the signature hash
          against the LogicRed audit trail before relying on this document.
        </p>
      </div>
    </div>
  );
}
