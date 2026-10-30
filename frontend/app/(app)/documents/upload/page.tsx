"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { UploadCloud, FileText, X, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DocumentItem, StudentRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/States";

const ACCEPTED = [".pdf", ".jpg", ".jpeg", ".png"];

type FileStatus = "queued" | "uploading" | "processing" | "done" | "error";
interface QueuedFile {
  file: File;
  status: FileStatus;
  error?: string;
  documentId?: string;
  recordId?: string;
}

function isAccepted(file: File): boolean {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  return ACCEPTED.includes(ext);
}

export default function UploadPage() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter(isAccepted).map((file) => ({ file, status: "queued" as FileStatus }));
    setQueue((prev) => [...prev, ...incoming]);
  }, []);

  function removeFile(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFile(index: number, patch: Partial<QueuedFile>) {
    setQueue((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function runBatch() {
    if (queue.length === 0) return;
    setRunning(true);

    const form = new FormData();
    queue.forEach((q) => form.append("files", q.file));
    queue.forEach((_, i) => updateFile(i, { status: "uploading" }));

    let documents: DocumentItem[];
    try {
      documents = await api.post<DocumentItem[]>("/api/documents/upload-batch", form);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Batch upload failed";
      setQueue((prev) => prev.map((f) => ({ ...f, status: "error", error: message })));
      setRunning(false);
      return;
    }

    // Match returned documents back to queue entries by filename (batch
    // upload skips files that individually fail validation).
    for (let i = 0; i < queue.length; i++) {
      const doc = documents.find((d) => d.filename.endsWith(queue[i].file.name.replace(/[^A-Za-z0-9._-]/g, "_")))
        || documents[i];
      if (!doc) {
        updateFile(i, { status: "error", error: "Upload rejected (unsupported type or too large)" });
        continue;
      }
      updateFile(i, { status: "processing", documentId: doc.id });
      try {
        const record = await api.post<StudentRecord>(`/api/documents/${doc.id}/process`);
        updateFile(i, { status: "done", recordId: record.id });
      } catch (e) {
        updateFile(i, { status: "error", error: e instanceof ApiError ? e.message : "Processing failed" });
      }
    }

    setRunning(false);
  }

  const doneCount = queue.filter((q) => q.status === "done").length;
  const allSettled = queue.length > 0 && queue.every((q) => q.status === "done" || q.status === "error");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-navy">Upload &amp; Digitize</h1>
        <p className="text-sm text-ink/55 mt-1">
          Drag and drop scanned admission lists/forms — batch upload supported. Each file runs through OCR,
          multilingual field extraction, confidence scoring, and validation automatically.
        </p>
      </div>

      <Card>
        <CardContent>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
            }}
            className={clsx(
              "border-2 border-dashed rounded-card px-6 py-10 text-center cursor-pointer transition-colors",
              dragging ? "border-accent bg-accent-bg/40" : "border-line hover:border-accent/40"
            )}
          >
            <UploadCloud size={26} className={clsx("mx-auto mb-3", dragging ? "text-accent" : "text-navy/40")} />
            <p className="text-sm font-medium text-navy">Drop files here, or click to browse</p>
            <p className="text-xs text-ink/45 mt-1">Max 20MB each · Supported: .pdf .jpg .jpeg .png · Multiple files supported</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{queue.length} file{queue.length > 1 ? "s" : ""} queued</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-line">
            {queue.map((q, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={15} className="text-ink/40 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-navy truncate">{q.file.name}</p>
                    {q.error && <p className="text-xs text-risk">{q.error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusIndicator status={q.status} />
                  {q.status === "done" && q.recordId && (
                    <Link href={`/records/${q.recordId}`} className="text-xs text-accent hover:underline">
                      View record
                    </Link>
                  )}
                  {q.status === "queued" && (
                    <button onClick={() => removeFile(i)} className="text-ink/35 hover:text-risk">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {allSettled ? (
        <Alert variant={doneCount === queue.length ? "success" : "info"}>
          Processed {doneCount} of {queue.length} document{queue.length > 1 ? "s" : ""}.
        </Alert>
      ) : null}

      <Button
        size="lg"
        className="w-full"
        onClick={runBatch}
        disabled={queue.length === 0 || running || allSettled}
      >
        {running ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Processing…
          </>
        ) : allSettled ? (
          "Done"
        ) : (
          <>
            Start Digitization <ArrowRight size={15} />
          </>
        )}
      </Button>
    </div>
  );
}

function StatusIndicator({ status }: { status: FileStatus }) {
  if (status === "queued") return <span className="text-xs text-ink/40">Queued</span>;
  if (status === "uploading") return <span className="text-xs text-accent flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Uploading</span>;
  if (status === "processing") return <span className="text-xs text-accent flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Processing</span>;
  if (status === "done") return <span className="text-xs text-verified flex items-center gap-1"><CheckCircle2 size={13} /> Done</span>;
  return <span className="text-xs text-risk flex items-center gap-1"><XCircle size={13} /> Failed</span>;
}
