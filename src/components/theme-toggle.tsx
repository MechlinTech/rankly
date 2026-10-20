"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * Return the site to its default light theme.
 *
 * Used on logout so a previously chosen dark theme is not restored on the next
 * visit. Writing the explicit "light" value (rather than removing the key)
 * guarantees light mode even when the OS prefers dark, since the startup script
 * otherwise falls back to `prefers-color-scheme`.
 */
export function resetThemeToLight(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
  try {
    localStorage.setItem("theme", "light");
  } catch {
    // Storage can be unavailable (private mode); the class removal above still applies.
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "class") {
        callback();
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  window.addEventListener("storage", callback);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  if (typeof window === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

interface ThemeToggleProps {
  className?: string;
  showLabels?: boolean;
}

export function ThemeToggle({ className = "", showLabels = false }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setThemeMode = (newTheme: Theme) => {
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {}
    } else {
      root.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    }
  };

  const isLight = theme === "light";
  const isDark = theme === "dark";

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className={`inline-flex items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 shadow-2xs backdrop-blur-sm transition-colors dark:border-slate-800/80 dark:bg-slate-800/60 ${className}`}
    >
      {/* Light Mode Button (Sun) */}
      <button
        type="button"
        data-theme="light"
        aria-label="Light mode"
        aria-pressed={isLight}
        title="Switch to Light mode (Sun)"
        onClick={() => setThemeMode("light")}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
          isLight
            ? "bg-white text-amber-600 shadow-2xs ring-1 ring-slate-900/5 dark:bg-slate-700 dark:text-amber-400"
            : "text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isLight ? "rotate-0 scale-105" : "rotate-12 opacity-70"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="4" strokeWidth="2" />
          <path
            strokeLinecap="round"
            strokeWidth="2"
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m14.14-14.14l-1.41 1.41"
          />
        </svg>
        {showLabels && <span className="text-[11px] font-semibold">Light</span>}
      </button>

      {/* Dark Mode Button (Moon) */}
      <button
        type="button"
        data-theme="dark"
        aria-label="Dark mode"
        aria-pressed={isDark}
        title="Switch to Dark mode (Moon)"
        onClick={() => setThemeMode("dark")}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
          isDark
            ? "bg-slate-900 text-slate-100 shadow-2xs ring-1 ring-white/10 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
            : "text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isDark ? "rotate-0 scale-105" : "-rotate-12 opacity-70"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
        {showLabels && <span className="text-[11px] font-semibold">Dark</span>}
      </button>
    </div>
  );
}
