"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, X, HelpCircle, Pencil, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { StudentRecordDetail, ExtractedField } from "@/lib/types";
import { FIELD_LABELS, FIELD_ORDER } from "@/lib/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfidenceBadge, ValidationBadge, StatusBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Form";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { DocumentPreview } from "@/components/DocumentPreview";
import { EvidencePanel } from "@/components/EvidencePanel";
import { SignatureModal } from "@/components/SignaturePad";

export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [record, setRecord] = useState<StudentRecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifyReason, setVerifyReason] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  const canVerify = user?.role === "AICTE_OFFICER";

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const r = await api.get<StudentRecordDetail>(`/api/records/${id}`);
      setRecord(r);
      const firstIssue = r.fields.find((f) => f.confidence_band !== "HIGH") || r.fields[0];
      setSelectedFieldName((prev) => prev || firstIssue?.field_name || null);
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load record");
      return null;
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!record) return <LoadingState />;

  const fieldMap = Object.fromEntries(record.fields.map((f) => [f.field_name, f]));
  const selectedField = selectedFieldName ? fieldMap[selectedFieldName] : null;
  const validationByField: Record<string, typeof record.validations> = {};
  record.validations.forEach((v) => {
    if (!v.affected_field) return;
    (validationByField[v.affected_field] ||= []).push(v);
  });

  function startEdit(f: ExtractedField) {
    setEditingField(f.field_name);
    setEditValue(f.value || "");
    setEditReason("");
  }

  async function saveEdit(fieldName: string) {
    setSaving(true);
    try {
      await api.patch(`/api/records/${id}/fields/${fieldName}`, {
        new_value: editValue,
        reason: editReason || "Manual correction by reviewer",
      });
      setEditingField(null);
      await load();
      showToast(`${FIELD_LABELS[fieldName] || fieldName} updated.`, "success");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Failed to save field";
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function performVerification(action: "APPROVE" | "REJECT" | "MARK_UNRESOLVED", signature?: string) {
    setVerifying(action);
    try {
      await api.post(`/api/records/${id}/verify`, { action, reason: verifyReason || undefined, signature });
      setSignatureModalOpen(false);
      await load();
      const labels: Record<string, string> = {
        APPROVE: "Record approved and marked VERIFIED.",
        REJECT: "Record rejected.",
        MARK_UNRESOLVED: "Record marked unresolved.",
      };
      showToast(labels[action], action === "REJECT" ? "info" : "success");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Verification action failed";
      setError(message);
      showToast(message, "error");
    } finally {
      setVerifying(null);
    }
  }

  if (record.status === "VERIFIED") {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-4">
        <ShieldCheck size={40} className="mx-auto text-verified" />
        <h1 className="font-serif text-2xl text-navy">VERIFIED DIGITAL STUDENT RECORD</h1>
        <p className="text-sm text-ink/55">
          This record has been reviewed and digitally signed by an authorized AICTE Officer on{" "}
          {record.verified_at ? new Date(record.verified_at).toLocaleString() : ""}.
        </p>
        {record.signature_hash && (
          <p className="text-[11px] font-mono text-ink/40 break-all px-4">
            Signature hash: {record.signature_hash}
          </p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => router.push(`/audit?record=${record.id}`)}>
            View Audit Trail
          </Button>
          <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-navy">{t("human_verification")}</h1>
          <p className="text-sm text-ink/55 mt-1">
            Review AI-extracted fields against the source document. Edit anything uncertain, then approve.
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Original Document</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentPreview document={record.document} fields={record.fields} selectedField={selectedField} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extracted Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-line">
            {FIELD_ORDER.map((name) => {
              const f = fieldMap[name];
              if (!f) return null;
              const issues = validationByField[name] || [];
              const isSelected = selectedFieldName === name;
              const isEditing = editingField === name;

              return (
                <div
                  key={name}
                  className={clsx(
                    "py-3 cursor-pointer transition-colors -mx-5 px-5",
                    isSelected && "bg-accent-bg/60"
                  )}
                  onClick={() => !isEditing && setSelectedFieldName(name)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-ink/55 w-32 shrink-0">{FIELD_LABELS[name]}</span>

                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
                      </div>
                    ) : (
                      <span className="flex-1 text-sm text-ink truncate">
                        {f.value ?? <em className="text-ink/35">missing</em>}
                      </span>
                    )}

                    <ConfidenceBadge band={f.confidence_band} score={Math.round(f.confidence)} />

                    {!isEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(f);
                        }}
                        className="text-ink/35 hover:text-navy p-1"
                        title="Edit field"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <Label>Reason for change</Label>
                        <Input
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="e.g. Corrected per admission register"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(name)} disabled={saving}>
                          {saving ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {issues.length > 0 && !isEditing && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {issues.map((v) => (
                        <ValidationBadge key={v.id} status={v.status as "WARNING" | "FAIL"} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {selectedField && <EvidencePanel field={selectedField} />}

      {canVerify && (
        <Card>
          <CardHeader>
            <CardTitle>Verification Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Reason / notes (optional)</Label>
              <Textarea
                value={verifyReason}
                onChange={(e) => setVerifyReason(e.target.value)}
                rows={2}
                placeholder="Add any notes for the audit trail…"
              />
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button onClick={() => setSignatureModalOpen(true)} disabled={!!verifying}>
                <Check size={15} /> {verifying === "APPROVE" ? "Approving…" : t("approve")}
              </Button>
              <Button variant="danger" onClick={() => performVerification("REJECT")} disabled={!!verifying}>
                <X size={15} /> {verifying === "REJECT" ? "Rejecting…" : t("reject")}
              </Button>
              <Button variant="outline" onClick={() => performVerification("MARK_UNRESOLVED")} disabled={!!verifying}>
                <HelpCircle size={15} /> {t("mark_unresolved")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <SignatureModal
        open={signatureModalOpen}
        onCancel={() => setSignatureModalOpen(false)}
        submitting={verifying === "APPROVE"}
        onConfirm={(signature) => performVerification("APPROVE", signature)}
      />
    </div>
  );
}
