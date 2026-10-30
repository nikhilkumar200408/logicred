"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { FileStack, ClipboardList, Clock, Gauge, ArrowRight, Users, History as HistoryIcon, Download } from "lucide-react";
import { api, ApiError, downloadAuthed } from "@/lib/api";
import { AdmissionsOverview, DashboardStats, OfficerQueueItem, UserActivityItem, AuditLogItem, DocumentItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingState, ErrorState, Alert, EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { StatusBadge, AnomalyBadge, ConfidenceBadge } from "@/components/ui/Badges";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useToast } from "@/components/ui/Toast";

const BAND_COLORS: Record<string, string> = { HIGH: "#16A34A", REVIEW: "#D97706", VERIFY: "#DC2626" };
const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "#D97706",
  AUTO_PASSED: "#16A34A",
  VERIFIED: "#16A34A",
  REJECTED: "#DC2626",
  UNRESOLVED: "#DC2626",
};

const cardIn = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3, ease: "easeOut" } }),
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!user) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-navy">{t("dashboard")}</h1>
          <p className="text-sm text-ink/55 mt-1">Upload. Validate. Verify. Monitor — APAAR-based student records for AICTE-approved institutions.</p>
        </div>
        {user.role === "INSTITUTION" && (
          <Link href="/students/upload">
            <Button>
              Upload Student Data <ArrowRight size={15} />
            </Button>
          </Link>
        )}
      </div>

      <Alert variant="info">
        Automated validation flags potential inconsistencies only — records remain subject to
        AICTE Officer verification and digital sign-off.
      </Alert>

      {user.role !== "EMPLOYER" && <AdmissionsPanel />}
      {user.role === "EMPLOYER" && (
        <Alert variant="info">
          Use <Link href="/verify-apaar" className="underline">Verify APAAR ID</Link> to check a student&apos;s
          verified enrolment. Every lookup is recorded in the audit trail.
        </Alert>
      )}
      {user.role === "ADMIN" && <AdminDashboard />}
      {user.role === "INSTITUTION" && <InstitutionDashboard />}
      {user.role === "AICTE_OFFICER" && <AicteOfficerDashboard />}
    </div>
  );
}

/* ------------------------------- Admin ---------------------------------- */

function ExportBar() {
  const [status, setStatus] = useState("");
  const [institution, setInstitution] = useState("");
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (institution) params.set("institution", institution);
      const filename = `logicred_records${status ? `_${status.toLowerCase()}` : ""}${institution ? `_${institution.toLowerCase()}` : ""}.csv`;
      await downloadAuthed(`/api/dashboard/export.csv?${params.toString()}`, filename);
      showToast("CSV export downloaded.", "success");
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 flex-wrap py-4">
        <Download size={16} className="text-accent shrink-0" />
        <span className="text-sm font-medium text-navy shrink-0">Bulk Export</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs border border-line rounded-card bg-white px-2.5 py-1.5 text-ink/70"
        >
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="AUTO_PASSED">Auto Passed</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="UNRESOLVED">Unresolved</option>
        </select>
        <input
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="Filter by institution ID (optional)"
          className="text-xs border border-line rounded-card bg-white px-2.5 py-1.5 text-ink/70 w-48"
        />
        <Button size="sm" variant="secondary" onClick={handleExport} disabled={exporting} className="ml-auto">
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<UserActivityItem[] | null>(null);
  const [feed, setFeed] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardStats>("/api/dashboard/stats"),
      api.get<UserActivityItem[]>("/api/dashboard/user-activity"),
      api.get<AuditLogItem[]>("/api/audit?limit=12"),
    ])
      .then(([s, a, f]) => {
        setStats(s);
        setActivity(a);
        setFeed(f);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load dashboard"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!stats || !activity || !feed) return <LoadingState label="Loading dashboard…" />;

  const confidenceData = ["HIGH", "REVIEW", "VERIFY"].map((band) => ({
    name: band,
    value: stats.confidence_distribution[band] || 0,
  }));
  const validationData = Object.entries(stats.validation_error_categories).map(([rule, count]) => ({
    rule: rule.replace(/_/g, " "),
    count,
  }));
  const statusData = Object.entries(stats.verification_status_breakdown).map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    count,
    fill: STATUS_COLORS[status] || "#2563EB",
  }));
  const districtData = Object.entries(stats.institution_wise_progress).map(([district, count]) => ({ district, count }));

  return (
    <>
      <ExportBar />

      <StatGrid
        items={[
          { icon: FileStack, label: "Submissions Processed", value: stats.documents_processed },
          { icon: ClipboardList, label: "Student Records", value: stats.records_extracted },
          { icon: Clock, label: "Pending Verification", value: stats.pending_verification, accent: "review" as const },
          { icon: Gauge, label: "Average Confidence", value: `${stats.average_confidence}%` },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat label="Auto-Processed" value={`${stats.auto_processed_pct}%`} />
        <MiniStat label="Human-Reviewed" value={`${stats.human_review_pct}%`} />
        <MiniStat label="Validation Warnings" value={stats.validation_warnings} />
        <MiniStat label="Avg. Processing Time" value={`${stats.average_processing_time_seconds}s`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Pipeline Confidence Breakdown">
          {confidenceData.every((d) => d.value === 0) ? (
            <p className="text-sm text-ink/45 py-10 text-center">No field data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={confidenceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {confidenceData.map((entry) => (
                    <Cell key={entry.name} fill={BAND_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Verification Status">
          {statusData.length === 0 ? (
            <p className="text-sm text-ink/45 py-10 text-center">No records yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="status" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Validation Error Categories">
          {validationData.length === 0 ? (
            <p className="text-sm text-ink/45 py-10 text-center">No validation warnings yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={validationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="rule" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#D97706" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Institution-wise Student Records">
          {districtData.length === 0 ? (
            <p className="text-sm text-ink/45 py-10 text-center">No institution data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={districtData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="district" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Users size={15} className="text-accent" />
            <CardTitle>User Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <EmptyState title="No user activity yet" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink/45 border-b border-line">
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-5 py-2.5 font-medium">Role</th>
                    <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.user_id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-navy">{a.full_name}</p>
                        <p className="text-xs text-ink/45">{a.username}</p>
                      </td>
                      <td className="px-5 py-2.5 text-ink/70">{a.role}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-navy">{a.action_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HistoryIcon size={15} className="text-accent" />
              <CardTitle>System-wide Audit Feed</CardTitle>
            </div>
            <Link href="/audit" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-line max-h-80 overflow-y-auto">
            {feed.length === 0 ? (
              <EmptyState title="No audit events yet" />
            ) : (
              feed.map((f) => (
                <div key={f.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-navy">{f.action}</span>
                  <span className="text-xs text-ink/45">{new Date(f.timestamp).toLocaleString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------ Officer ----------------------------------*/

function AicteOfficerDashboard() {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<OfficerQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<"flagged" | "all">("flagged");

  useEffect(() => {
    setQueue(null);
    api
      .get<OfficerQueueItem[]>(`/api/dashboard/officer-queue?risk=${riskFilter}`)
      .then(setQueue)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load queue"));
  }, [riskFilter]);

  if (error) return <ErrorState message={error} />;
  if (!queue) return <LoadingState label="Loading your queue…" />;

  return (
    <>
      <StatGrid
        items={[
          { icon: ClipboardList, label: riskFilter === "flagged" ? "High/Medium Risk Records" : "Records in Queue", value: queue.length, accent: "review" as const },
          {
            icon: Gauge,
            label: "High Anomaly",
            value: queue.filter((q) => q.anomaly_level === "HIGH").length,
          },
        ]}
      />

      <Card>
        <CardHeader className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>{t("verification_queue")}</CardTitle>
          <div className="flex items-center gap-1 rounded-card border border-line bg-slate-50 p-1 text-xs">
            <button
              onClick={() => setRiskFilter("flagged")}
              className={`px-3 py-1.5 rounded-[7px] font-medium transition-colors ${riskFilter === "flagged" ? "bg-white shadow-card text-accent" : "text-ink/55 hover:text-navy"}`}
            >
              {t("high_medium_risk")}
            </button>
            <button
              onClick={() => setRiskFilter("all")}
              className={`px-3 py-1.5 rounded-[7px] font-medium transition-colors ${riskFilter === "all" ? "bg-white shadow-card text-accent" : "text-ink/55 hover:text-navy"}`}
            >
              {t("all_pending")}
            </button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadAuthed(
                `/api/dashboard/export.csv?status=${riskFilter === "flagged" ? "PENDING_REVIEW" : ""}`,
                `logicred_queue_${riskFilter}.csv`
              )
            }
          >
            <Download size={13} /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <EmptyState
              title="Queue is clear"
              description={riskFilter === "flagged" ? "No High/Medium risk records need verification right now." : "No records currently need manual verification."}
            />
          ) : (
            <div className="divide-y divide-line">
              {queue.map((r, i) => (
                <motion.div
                  key={r.record_id}
                  custom={i}
                  initial="hidden"
                  animate="show"
                  variants={cardIn}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-navy truncate">{r.student_name || "Student unknown"}</p>
                    <p className="text-xs text-ink/45">
                      APAAR {r.apaar_id || "—"} · {r.institution_name || "—"}, {r.program || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <ConfidenceBadge band={r.overall_confidence >= 90 ? "HIGH" : r.overall_confidence >= 70 ? "REVIEW" : "VERIFY"} score={Math.round(r.overall_confidence)} />
                    <AnomalyBadge level={r.anomaly_level} score={0} />
                    <StatusBadge status={r.status} />
                    <Link href={`/records/${r.record_id}/verify`}>
                      <Button size="sm">{t("review_edit")}</Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------- Data Entry Operator -----------------------------*/

function InstitutionDashboard() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DocumentItem[]>("/api/documents")
      .then(setDocuments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load documents"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!documents) return <LoadingState label="Loading your uploads…" />;

  const processed = documents.filter((d) => d.status === "PROCESSED").length;
  const failed = documents.filter((d) => d.status === "FAILED").length;
  const inProgress = documents.filter((d) => d.status === "UPLOADED" || d.status === "PROCESSING").length;

  return (
    <>
      <StatGrid
        items={[
          { icon: FileStack, label: "Total Uploads", value: documents.length },
          { icon: Clock, label: "Awaiting Processing", value: inProgress, accent: "review" as const },
          { icon: Gauge, label: "Processed", value: processed },
        ]}
      />

      <Card className="border-dashed border-2 border-accent/25 bg-accent-bg/30">
        <CardContent className="flex items-center justify-between flex-wrap gap-4 py-6">
          <div>
            <p className="font-serif text-lg text-navy">Drag &amp; drop scanned registers</p>
            <p className="text-sm text-ink/55 mt-1">Batch-upload .pdf, .jpg, .jpeg, or .png files for OCR processing.</p>
          </div>
          <Link href="/students/upload">
            <Button size="lg">
              Upload Student Data <ArrowRight size={15} />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <FileStack size={15} className="text-accent" />
          <CardTitle>{t("your_uploads")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <EmptyState title="No uploads yet" description="Uploaded documents will appear here with their processing status." />
          ) : (
            <div className="divide-y divide-line">
              {documents.slice(0, 15).map((d, i) => (
                <motion.div
                  key={d.id}
                  custom={i}
                  initial="hidden"
                  animate="show"
                  variants={cardIn}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-navy truncate">{d.filename}</p>
                    <p className="text-xs text-ink/45">
                      Uploaded {new Date(d.uploaded_at).toLocaleString()}
                      {d.error_message ? ` · ${d.error_message}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <DocumentStatusBadge status={d.status} />
                    {d.student_record_id && (
                      <Link href={`/records/${d.student_record_id}/verify`}>
                        <Button size="sm" variant="secondary">{t("review_edit")}</Button>
                      </Link>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function DocumentStatusBadge({ status }: { status: DocumentItem["status"] }) {
  const styles: Record<string, string> = {
    UPLOADED: "bg-review-bg text-review",
    PROCESSING: "bg-accent-bg text-accent",
    PROCESSED: "bg-verified-bg text-verified",
    FAILED: "bg-risk-bg text-risk",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[status] || "bg-slate-100 text-ink/60"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ------------------------------- Shared -----------------------------------*/

function StatGrid({
  items,
}: {
  items: { icon: typeof FileStack; label: string; value: string | number; accent?: "review" }[];
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item, i) => (
        <motion.div key={item.label} custom={i} initial="hidden" animate="show" variants={cardIn}>
          <StatCard {...item} />
        </motion.div>
      ))}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof FileStack;
  label: string;
  value: string | number;
  accent?: "review";
}) {
  return (
    <Card className="hover:shadow-elevated transition-shadow">
      <CardContent className="flex items-center gap-3.5">
        <div
          className={`h-10 w-10 rounded-card flex items-center justify-center shrink-0 ${
            accent === "review" ? "bg-review-bg text-review" : "bg-accent-bg text-accent"
          }`}
        >
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xl font-serif font-semibold text-navy leading-none">{value}</p>
          <p className="text-xs text-ink/50 mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-line bg-white px-4 py-3">
      <p className="text-lg font-semibold text-navy leading-none">{value}</p>
      <p className="text-xs text-ink/50 mt-1.5">{label}</p>
    </div>
  );
}


function AdmissionsPanel() {
  const [data, setData] = useState<AdmissionsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdmissionsOverview>("/api/dashboard/admissions")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load admissions overview"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading admissions monitor…" />;

  const tiles = [
    { label: "Students", value: data.total_students },
    { label: "Institutions", value: data.institutions },
    { label: "Programs over intake", value: data.excess_programs, bad: data.excess_programs > 0 },
    { label: "Duplicate records", value: data.duplicate_flags, bad: data.duplicate_flags > 0 },
    { label: "Cross-institution flags", value: data.cross_institution_flags, bad: data.cross_institution_flags > 0 },
    { label: "Invalid / missing APAAR", value: data.invalid_apaar, bad: data.invalid_apaar > 0 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Real-time Admissions Monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-card border border-line p-3">
              <p className="text-[11px] text-ink/50">{x.label}</p>
              <p className={`text-xl font-semibold ${x.bad ? "text-red-600" : "text-navy"}`}>{x.value}</p>
            </div>
          ))}
        </div>
        {data.rows.length === 0 ? (
          <p className="text-sm text-ink/45">No admissions submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy/5 text-left text-xs text-ink/55 uppercase tracking-wide">
                  {["Institution", "Program", "Year", "Approved intake", "Regular", "Supernumerary", "NRI", "OCI", "FN", "Utilisation"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.institution_id}-${r.program}-${r.year_of_admission}`} className="border-t border-line">
                    <td className="px-3 py-2">{r.institution_name || r.institution_id}</td>
                    <td className="px-3 py-2">{r.program}</td>
                    <td className="px-3 py-2">{r.year_of_admission}</td>
                    <td className="px-3 py-2">{r.approved_intake ?? "—"}</td>
                    <td className={`px-3 py-2 ${r.excess > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {r.regular_enrolled}{r.excess > 0 ? ` (+${r.excess} excess)` : ""}
                    </td>
                    <td className="px-3 py-2">{r.supernumerary}</td>
                    <td className="px-3 py-2">{r.nri}</td>
                    <td className="px-3 py-2">{r.oci}</td>
                    <td className="px-3 py-2">{r.foreign_national}</td>
                    <td className="px-3 py-2">{r.utilisation_pct != null ? `${r.utilisation_pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
