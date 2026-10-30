"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DocumentItem, StudentRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badges";
import { LoadingState, ErrorState, Alert } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  function load() {
    api
      .get<DocumentItem>(`/api/documents/${id}`)
      .then(setDocument)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load document"));
  }

  async function process() {
    setProcessing(true);
    setError(null);
    try {
      const record = await api.post<StudentRecord>(`/api/documents/${id}/process`);
      router.push(`/records/${record.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Processing failed");
      setProcessing(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!document) return <LoadingState />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-card bg-navy/8 text-navy flex items-center justify-center shrink-0">
          <FileText size={20} />
        </div>
        <div>
          <h1 className="font-serif text-xl text-navy">{document.filename}</h1>
          <p className="text-xs text-ink/50">Uploaded {new Date(document.uploaded_at).toLocaleString()}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Document Status</CardTitle>
          <StatusBadge status={document.status} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="File type" value={document.file_type} />
          <Row label="Size" value={`${(document.file_size_bytes / 1024).toFixed(1)} KB`} />
          {document.processed_at && (
            <Row label="Processed at" value={new Date(document.processed_at).toLocaleString()} />
          )}
        </CardContent>
      </Card>

      {document.error_message && <Alert variant="danger">{document.error_message}</Alert>}

      {document.student_record_id ? (
        <Button onClick={() => router.push(`/records/${document.student_record_id}`)} className="w-full" size="lg">
          View Digital Record
        </Button>
      ) : (
        <Button onClick={process} disabled={processing} className="w-full" size="lg">
          {processing ? "Processing…" : "Start AI Digitization"}
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink/50">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
