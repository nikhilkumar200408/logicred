"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eraser, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Digital signature capture — an interactive canvas the AICTE Officer
 * draws into before approving a record. The signature is exported as a
 * base64 PNG data URL; the backend binds it (plus record id, signer id,
 * timestamp) into a SHA-256 signature_hash stored permanently on the
 * record and every subsequent audit entry.
 */
export function SignatureModal({
  open,
  onCancel,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (signatureDataUrl: string) => void;
  submitting: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }
  function end() {
    drawing.current = false;
  }
  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-card shadow-elevated w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-lg text-navy">Digital Signature</h3>
              <button onClick={onCancel} className="text-ink/40 hover:text-risk">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-ink/55 mb-4">
              Sign below to approve this record. Your signature is cryptographically bound to this
              record and permanently recorded in the audit trail.
            </p>

            <canvas
              ref={canvasRef}
              width={420}
              height={160}
              className="w-full border border-line rounded-card bg-slate-50 touch-none"
              onMouseDown={start}
              onMouseMove={move}
              onMouseUp={end}
              onMouseLeave={end}
              onTouchStart={start}
              onTouchMove={move}
              onTouchEnd={end}
            />

            <div className="flex items-center justify-between mt-4">
              <button onClick={clear} className="text-xs text-ink/50 hover:text-navy flex items-center gap-1.5">
                <Eraser size={13} /> Clear
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!hasDrawn || submitting}
                  onClick={() => onConfirm(canvasRef.current!.toDataURL("image/png"))}
                >
                  {submitting ? "Signing…" : "Sign & Approve"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
