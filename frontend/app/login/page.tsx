"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import { ShieldCheck, Lock, User } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-paper overflow-hidden">
      {/* Left panel — brand + floating grid */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-navy text-paper px-14 py-12">
        <FloatingGrid />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex items-center gap-2.5"
        >
          <div className="h-9 w-9 rounded-full border-2 border-accent-light flex items-center justify-center">
            <ShieldCheck size={18} className="text-accent-light" />
          </div>
          <span className="font-serif font-semibold text-lg tracking-tight">LogicRed</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative z-10 max-w-md"
        >
          <p className="text-xs uppercase tracking-wide text-accent-light mb-3">SIH 2026 · PS 26018</p>
          <h1 className="font-serif text-4xl leading-tight mb-5">
            Upload. Validate. Verify. Monitor.
          </h1>
          <p className="text-paper/70 text-sm leading-relaxed mb-8">
            An APAAR-based Student Data Management &amp; Verification System for
            AICTE-approved institutions — automated validation, anomaly detection and
            secure verification of student enrolment records.
          </p>
          <div className="border-t border-paper/15 pt-6 text-xs text-paper/50 leading-relaxed">
            Automated checks flag potential inconsistencies only; they are not a regulatory finding.
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 text-xs text-paper/40"
        >
          All approvals are digitally signed and permanently auditable.
        </motion.p>
      </div>

      {/* Right panel — sign in form */}
      <div className="flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <ShieldCheck size={20} className="text-accent" />
            <span className="font-serif font-semibold text-lg text-navy">LogicRed</span>
          </div>

          <h2 className="font-serif text-2xl text-navy mb-1">Sign in</h2>
          <p className="text-sm text-ink/55 mb-8">Access the student data verification workspace.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
                <Input
                  id="username"
                  className="pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                <Alert variant="danger">{error}</Alert>
              </motion.div>
            )}

            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </motion.div>
          </form>

          <p className="mt-10 text-center text-xs text-ink/35">
            Access is provisioned by your system administrator.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function FloatingGrid() {
  const cells = Array.from({ length: 24 });
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-6 p-10 opacity-[0.07]">
      {cells.map((_, i) => (
        <motion.div
          key={i}
          className="aspect-square rounded-lg border border-paper"
          initial={{ opacity: 0.3, y: 0 }}
          animate={{ opacity: [0.2, 0.6, 0.2], y: [0, -6, 0] }}
          transition={{
            duration: 4 + (i % 5),
            repeat: Infinity,
            delay: (i % 8) * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
