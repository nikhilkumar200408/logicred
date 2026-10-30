import { ExtractedField } from "@/lib/types";
import { FIELD_LABELS } from "@/lib/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function EvidencePanel({ field }: { field: ExtractedField }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence — {FIELD_LABELS[field.field_name]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Extracted value" value={field.value ?? "missing"} />
        <Row label="Source page" value={field.source_page ? `Page ${field.source_page}` : "—"} />
        <Row label="OCR text" value={field.source_text || "No OCR evidence found"} mono />
        <Row label="OCR confidence" value={`${field.ocr_confidence}%`} />
        <Row label="Extraction confidence" value={`${field.extraction_confidence}%`} />
        {field.review_reason && <Row label="Review reason" value={field.review_reason} highlight />}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-ink/45 mb-0.5">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} ${highlight ? "text-review font-medium" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
