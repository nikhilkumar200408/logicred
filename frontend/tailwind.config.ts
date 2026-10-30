import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Crisp modern light theme
        paper: "#F8FAFC",   // slate-50 app background
        ink: "#0F172A",     // slate-900 primary text
        line: "#E2E8F0",    // slate-200 borders
        navy: {
          DEFAULT: "#0F172A",
          light: "#1E293B",
          dark: "#020617",
        },
        accent: {
          DEFAULT: "#2563EB", // blue-600 primary accent
          light: "#3B82F6",
          dark: "#1D4ED8",
          bg: "#EFF6FF",
        },
        verified: {
          DEFAULT: "#16A34A",
          bg: "#F0FDF4",
        },
        review: {
          DEFAULT: "#D97706",
          bg: "#FFFBEB",
        },
        risk: {
          DEFAULT: "#DC2626",
          bg: "#FEF2F2",
        },
      },
      fontFamily: {
        serif: ["var(--font-plex-serif)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04)",
        elevated: "0 4px 24px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
