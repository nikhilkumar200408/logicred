"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, UserRoundPlus } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { User } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";

type Role = "INSTITUTION" | "EMPLOYER";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("INSTITUTION");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const result = await api.post<{ access_token: string; user: User }>("/api/auth/register", {
        full_name: fullName, username, password, role,
        institution_id: role === "INSTITUTION" ? institutionId : null,
        institution_name: role === "INSTITUTION" ? institutionName : null,
      });
      setToken(result.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-5 py-10">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg bg-white border border-line rounded-2xl shadow-sm p-7 sm:p-9">
        <div className="flex items-center gap-3 mb-7">
          <div className="h-10 w-10 rounded-full bg-accent-bg flex items-center justify-center"><ShieldCheck className="text-accent" size={21} /></div>
          <div><p className="font-serif font-semibold text-xl text-navy">LogicRed</p><p className="text-xs text-ink/50">Create your account</p></div>
        </div>
        <h1 className="font-serif text-2xl text-navy mb-1">Create an account</h1>
        <p className="text-sm text-ink/55 mb-6">Register to access the student data verification workspace.</p>
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="role">Select your role</Label>
            <select id="role" value={role} onChange={e => setRole(e.target.value as Role)} className="w-full rounded-card border border-line bg-white px-3 py-2.5 text-sm focus-ring">
              <option value="INSTITUTION">Institution representative</option>
              <option value="EMPLOYER">Employer / Recruiter</option>
            </select>
          </div>
          <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" /></div>
          <div><Label htmlFor="username">Username</Label><Input id="username" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} autoComplete="username" /></div>
          {role === "INSTITUTION" && <>
            <div><Label htmlFor="institutionName">Institution name</Label><Input id="institutionName" value={institutionName} onChange={e => setInstitutionName(e.target.value)} required /></div>
            <div><Label htmlFor="institutionId">AICTE / Institution ID</Label><Input id="institutionId" value={institutionId} onChange={e => setInstitutionId(e.target.value)} required /></div>
          </>}
          <div><Label htmlFor="password">Password (minimum 8 characters)</Label><Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></div>
          <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" /></div>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
        </form>
        <p className="mt-6 text-xs text-center text-ink/55">Already registered? <Link href="/login" className="text-accent font-medium hover:underline">Sign in</Link></p>
        <p className="mt-4 text-[11px] text-center text-ink/40">ADMIN and AICTE Officer accounts require authorized provisioning.</p>
      </motion.section>
    </main>
  );
}
