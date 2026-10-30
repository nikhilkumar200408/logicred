"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ApaarVerification } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/Badges";
import { useAuth } from "@/lib/auth";

export default function VerifyApaarPage() {
  const { user } = useAuth();
  const [apaar, setApaar] = useState("");
  const [data, setData] = useState<ApaarVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setBusy(true); setError(null); setData(null);
    try {
      setData(await api.get<ApaarVerification>(`/api/verify/${encodeURIComponent(apaar.replace(/[\s-]/g, ""))}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lookup failed");
    } finally { setBusy(false); }
  }

  const privileged = user?.role === "ADMIN" || user?.role === "AICTE_OFFICER";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl text-navy">Verify APAAR ID</h1>
        <p className="text-sm text-ink/55 mt-1">
          Secure verification for AICTE, institutions, employers and regulators. Every lookup is written to the audit
          trail; personal details are shown only where the student has given consent.
        </p>
      </div>

      <Card>
        <CardContent className="flex gap-3 items-center pt-5">
          <Input value={apaar} onChange={(e) => setApaar(e.target.value)} placeholder="Enter 12-digit APAAR ID"
            onKeyDown={(e) => e.key === "Enter" && apaar && lookup()} />
          <Button onClick={lookup} disabled={!apaar || busy}><Search size={15} /> Verify</Button>
        </CardContent>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {data && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            {data.verified ? <ShieldCheck size={18} className="text-verified" /> : <ShieldAlert size={18} className="text-review" />}
            <CardTitle>
              {data.verified ? "Verified enrolment found" : "Enrolment found — not yet verified by AICTE"}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-line p-0">
            {data.enrolments.map((e) => (
              <div key={e.record_id} className="px-5 py-3.5 text-sm flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-navy">{e.institution_name || e.institution_id}</p>
                  <p className="text-xs text-ink/55">
                    {e.program} · admitted {e.year_of_admission}
                    {e.student_name ? ` · ${e.student_name}` : ""}{e.student_id ? ` (${e.student_id})` : ""}
                  </p>
                  {e.signature_hash && <p className="text-[10px] font-mono text-ink/40 break-all mt-1">SHA-256: {e.signature_hash}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={e.status} />
                  {privileged && <Link className="text-accent text-xs" href={`/records/${e.record_id}`}>Open</Link>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
