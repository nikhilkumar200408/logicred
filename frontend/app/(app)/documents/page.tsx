"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, UploadCloud } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DocumentItem } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badges";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/Button";

export default function DocumentsPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DocumentItem[]>("/api/documents")
      .then(setDocuments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load documents"));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-navy">{t("documents")}</h1>
          <p className="text-sm text-ink/55 mt-1">{t("documents_hint")}</p>
        </div>
        <Link href="/documents/upload">
          <Button>
            <UploadCloud size={15} /> {t("upload_document")}
          </Button>
        </Link>
      </div>

      {error && <ErrorState message={error} />}
      {!error && !documents && <LoadingState />}
      {documents && documents.length === 0 && (
        <EmptyState title={t("no_documents_yet")} description={t("upload_hint")} />
      )}

      {documents && documents.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy/5 text-left text-xs text-ink/55 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">{t("document")}</th>
                <th className="px-5 py-3 font-medium">{t("size")}</th>
                <th className="px-5 py-3 font-medium">{t("status")}</th>
                <th className="px-5 py-3 font-medium">{t("uploaded")}</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-line hover:bg-navy/[0.02]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText size={15} className="text-navy/40 shrink-0" />
                      <span className="font-medium text-ink">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink/60">{(doc.file_size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-5 py-3 text-ink/50 text-xs">{new Date(doc.uploaded_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/documents/${doc.id}`} className="text-xs font-medium text-navy hover:underline">
                      {t("view")} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
