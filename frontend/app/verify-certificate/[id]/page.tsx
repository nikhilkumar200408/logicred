"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface PublicVerification {
  record_id: string;
  status: string;
  verified_at: string | null;
  signature_hash: string | null;
}

/**
 * Public, unauthenticated verification page — reached by scanning the QR
 * code on a printed Digital Verification Certificate. No login required,
 * deliberately shows nothing beyond verification status + signature hash.
 */
export default function PublicVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PublicVerification | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/records/public-verify/${id}`)
      .then((res) => {
        if (!res.ok) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((json) => json && setData(json))
      .catch(() => setNotFound(true));
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-line rounded-card shadow-elevated p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <ShieldCheck size={20} className="text-accent" />
          <span className="font-serif font-semibold text-navy">LogicRed</span>
        </div>

        {notFound && (
          <>
            <ShieldX size={40} className="mx-auto text-risk mb-3" />
            <h1 className="font-serif text-lg text-navy mb-1">Not a Verified Record</h1>
            <p className="text-sm text-ink/55">
              This certificate ID doesn't match a verified LogicRed record. It may have been rejected,
              is still pending review, or the ID is incorrect.
            </p>
          </>
        )}

        {!notFound && !data && <p className="text-sm text-ink/50">Checking certificate…</p>}

        {data && (
          <>
            <ShieldCheck size={40} className="mx-auto text-verified mb-3" />
            <h1 className="font-serif text-lg text-navy mb-1">Certificate Verified</h1>
            <p className="text-sm text-ink/55 mb-5">
              This record was digitally signed and approved by an authorized AICTE Officer.
            </p>
            <div className="text-left text-xs bg-slate-50 border border-line rounded-card p-4 space-y-2">
              <Row label="Record ID" value={data.record_id} mono />
              <Row label="Status" value={data.status} />
              <Row label="Verified on" value={data.verified_at ? new Date(data.verified_at).toLocaleString() : "—"} />
              {data.signature_hash && <Row label="Signature (SHA-256)" value={data.signature_hash} mono breakAll />}
            </div>
            <p className="text-[10px] text-ink/35 mt-5">
              Compare the signature hash above with the one printed on the paper certificate — they must match
              exactly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, breakAll }: { label: string; value: string; mono?: boolean; breakAll?: boolean }) {
  return (
    <div>
      <p className="text-ink/45">{label}</p>
      <p className={`text-navy font-medium ${mono ? "font-mono" : ""} ${breakAll ? "break-all" : ""}`}>{value}</p>
    </div>
  );
}
