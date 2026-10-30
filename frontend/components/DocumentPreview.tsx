"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ZoomIn, ZoomOut, RotateCcw, FileWarning } from "lucide-react";
import { ExtractedField, DocumentItem } from "@/lib/types";
import { fetchAuthedBlobUrl } from "@/lib/api";

/**
 * Real high-resolution document viewer: loads the ACTUAL uploaded scan (via
 * the authenticated /api/documents/{id}/file endpoint) and overlays a real
 * OCR bounding box for the selected field, in the image's native pixel
 * space. Supports pan (drag) and zoom (buttons/wheel).
 *
 * PDFs are shown via the browser's built-in PDF viewer (no bbox overlay,
 * since bbox coordinates are per-rasterized-page — a documented simplification).
 */
export function DocumentPreview({
  document,
  fields,
  selectedField,
}: {
  document: DocumentItem;
  fields: ExtractedField[];
  selectedField: ExtractedField | null;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const isPdf = document.file_type === "application/pdf" || document.filename.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let url: string | null = null;
    fetchAuthedBlobUrl(`/api/documents/${document.id}/file`)
      .then((u) => {
        url = u;
        setBlobUrl(u);
      })
      .catch(() => setError("Original file is not available on this server."));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [document.id]);

  const pages = Array.from(new Set(fields.map((f) => f.source_page).filter((p): p is number => !!p))).sort();
  const activePage = selectedField?.source_page || pages[0] || 1;
  const activePageFields = fields.filter((f) => f.source_page === activePage);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
  }
  function onMouseDown(e: React.MouseEvent) {
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    setPan({
      x: dragging.current.panX + (e.clientX - dragging.current.startX),
      y: dragging.current.panY + (e.clientY - dragging.current.startY),
    });
  }
  function onMouseUp() {
    dragging.current = null;
  }

  if (isPdf && blobUrl) {
    return (
      <div className="rounded-card border border-line overflow-hidden">
        <embed src={blobUrl} type="application/pdf" className="w-full h-[560px]" />
        <p className="text-[11px] text-ink/40 py-2 text-center">
          PDF viewer — field evidence highlighting is available for image uploads.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-line bg-slate-50 p-10 text-center text-ink/45">
        <FileWarning size={22} className="mx-auto mb-2" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {pages.length > 1 ? (
          <div className="flex gap-1.5">
            {pages.map((p) => (
              <span
                key={p}
                className={clsx(
                  "text-xs px-2.5 py-1 rounded-card border",
                  p === activePage ? "bg-navy text-paper border-navy" : "border-line text-ink/55"
                )}
              >
                Page {p}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="p-1.5 rounded-card border border-line hover:bg-slate-50">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="p-1.5 rounded-card border border-line hover:bg-slate-50">
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded-card border border-line hover:bg-slate-50"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div
        className="relative rounded-card border border-line bg-slate-100 overflow-hidden h-[560px] cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {blobUrl && (
          <div
            className="absolute top-1/2 left-1/2 select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: dragging.current ? "none" : "transform 0.1s ease-out",
            }}
          >
            <div className="relative inline-block">
              <img
                src={blobUrl}
                draggable={false}
                onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="max-w-none pointer-events-none"
                style={{ maxHeight: 560 }}
                alt="Uploaded admission document scan"
              />
              {naturalSize && (
                <svg
                  className="absolute inset-0"
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
                  preserveAspectRatio="none"
                >
                  {activePageFields.map((f) => {
                    if (!f.source_bbox) return null;
                    const [x1, y1, x2, y2] = f.source_bbox;
                    const isSelected = selectedField?.id === f.id;
                    if (!isSelected) return null;
                    return (
                      <rect
                        key={f.id}
                        x={x1 - 6}
                        y={y1 - 6}
                        width={x2 - x1 + 12}
                        height={y2 - y1 + 12}
                        rx={3}
                        fill="rgba(37,99,235,0.14)"
                        stroke="#2563EB"
                        strokeWidth={3}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink/40 mt-2 text-center">
        Scroll to zoom, drag to pan. The highlighted region is the real OCR bounding box for the selected field.
      </p>
    </div>
  );
}
