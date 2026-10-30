"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileStack,
  UploadCloud,
  ClipboardCheck,
  History,
  ShieldCheck,
  LogOut,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLanguage, Lang, LANG_LABELS } from "@/lib/language";
import { LoadingState } from "@/components/ui/States";

const NAV_ITEMS: { href: string; key: string; label?: string; icon: any; roles?: string[] }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/students/upload", key: "student_upload", label: "Student Data Upload", icon: UploadCloud, roles: ["INSTITUTION", "ADMIN"] },
  { href: "/documents/upload", key: "upload", label: "Scan Upload (OCR)", icon: FileStack, roles: ["INSTITUTION", "ADMIN"] },
  { href: "/documents", key: "documents", label: "Submissions", icon: FileStack, roles: ["INSTITUTION", "ADMIN", "AICTE_OFFICER"] },
  { href: "/records", key: "records", icon: ClipboardCheck, roles: ["INSTITUTION", "ADMIN", "AICTE_OFFICER"] },
  { href: "/verify-apaar", key: "verify_apaar", label: "Verify APAAR ID", icon: ShieldCheck },
  { href: "/audit", key: "audit_trail", icon: History, roles: ["INSTITUTION", "ADMIN", "AICTE_OFFICER"] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <LoadingState label="Checking session…" />;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] bg-paper">
      <aside className="hidden lg:flex flex-col bg-white border-r border-line px-4 py-6 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="h-8 w-8 rounded-full bg-accent-bg flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-accent" />
          </div>
          <div className="leading-tight">
            <p className="font-serif font-semibold text-sm text-navy">LogicRed</p>
            <p className="text-[10px] text-ink/45">PS 26018</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative flex items-center gap-2.5 rounded-card px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent-bg text-accent font-medium" : "text-ink/60 hover:bg-slate-50 hover:text-navy"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-card bg-accent-bg -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={16} />
                {item.label ?? t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line pt-4 px-2">
          <p className="text-xs font-medium text-navy">{user.full_name}</p>
          <p className="text-[11px] text-ink/45 mb-3">{user.role}</p>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-ink/55 hover:text-risk transition-colors"
          >
            <LogOut size={13} /> {t("sign_out")}
          </button>
        </div>
      </aside>

      <div className="flex flex-col min-h-screen">
        <TopBar />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex-1 px-5 py-6 lg:px-8 lg:py-8 max-w-[1400px] w-full mx-auto"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}

function TopBar() {
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-line px-5 lg:px-8 py-3 flex items-center justify-between gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
          if (q) router.push(`/records?q=${encodeURIComponent(q)}`);
        }}
        className="relative w-full max-w-sm"
      >
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          name="q"
          placeholder={t("search_placeholder")}
          className="w-full rounded-card border border-line bg-slate-50 pl-9 pr-3 py-2 text-sm focus-ring focus:bg-white transition-colors"
        />
      </form>
      <div className="flex items-center gap-3 shrink-0">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="text-xs border border-line rounded-card bg-white px-2 py-1.5 text-ink/70 focus-ring cursor-pointer"
          aria-label="Language"
        >
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <option key={l} value={l}>
              {LANG_LABELS[l]}
            </option>
          ))}
        </select>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-verified-bg text-verified px-3 py-1 text-xs font-medium">
          <ShieldCheck size={12} /> {t("live_pipeline")}
        </span>
      </div>
    </header>
  );
}
