"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { StudentRecord, SearchResultItem } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/Badges";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { useLanguage } from "@/lib/language";

export default function RecordsPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [records, setRecords] = useState<StudentRecord[] | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialQ) {
      runSearch(initialQ);
    } else {
      loadRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadRecords() {
    setSearchResults(null);
    api
      .get<StudentRecord[]>("/api/records")
      .then(setRecords)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load records"));
  }

  function runSearch(query: string) {
    setRecords(null);
    api
      .get<SearchResultItem[]>(`/api/search?q=${encodeURIComponent(query)}`)
      .then(setSearchResults)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Search failed"));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) runSearch(q.trim());
    else loadRecords();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-navy">{t("land_records")}</h1>
        <p className="text-sm text-ink/55 mt-1">{t("records_search_hint")}</p>
      </div>

      <form onSubmit={handleSubmit} className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search_records")}
          className="pl-9"
        />
      </form>

      {error && <ErrorState message={error} />}

      {searchResults && (
        <Card className="overflow-hidden">
          {searchResults.length === 0 ? (
            <EmptyState title={t("no_matching_records")} description={t("try_different_search")} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy/5 text-left text-xs text-ink/55 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">{t("owner")}</th>
                  <th className="px-5 py-3 font-medium">{t("survey_khasra")}</th>
                  <th className="px-5 py-3 font-medium">{t("location")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
                  <th className="px-5 py-3 font-medium">{t("confidence")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {searchResults.map((r) => (
                  <tr key={r.record_id} className="border-t border-line hover:bg-navy/[0.02]">
                    <td className="px-5 py-3 font-medium text-ink">{r.student_name || "—"}</td>
                    <td className="px-5 py-3 text-ink/70">{r.apaar_id || "—"}</td>
                    <td className="px-5 py-3 text-ink/60">
                      {[r.institution_name, r.program, r.year_of_admission].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3">{r.overall_confidence}%</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/records/${r.record_id}`} className="text-xs font-medium text-navy hover:underline">
                        {t("view")} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!searchResults && !records && !error && <LoadingState />}

      {!searchResults && records && (
        <Card className="overflow-hidden">
          {records.length === 0 ? (
            <EmptyState title={t("no_records_yet")} description={t("upload_to_create_hint")} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy/5 text-left text-xs text-ink/55 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">{t("record")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
                  <th className="px-5 py-3 font-medium">{t("confidence")}</th>
                  <th className="px-5 py-3 font-medium">{t("anomaly")}</th>
                  <th className="px-5 py-3 font-medium">{t("created")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-navy/[0.02]">
                    <td className="px-5 py-3 font-mono text-xs text-ink/60">{r.id.slice(0, 8)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3">
                      <ConfidenceBadge
                        band={r.overall_confidence >= 90 ? "HIGH" : r.overall_confidence >= 70 ? "REVIEW" : "VERIFY"}
                        score={r.overall_confidence}
                      />
                    </td>
                    <td className="px-5 py-3 text-ink/60">{r.anomaly_score}/100 · {r.anomaly_level}</td>
                    <td className="px-5 py-3 text-ink/50 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/records/${r.id}`} className="text-xs font-medium text-navy hover:underline">
                        {t("view")} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
