import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  badge,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words [overflow-wrap:anywhere]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "critical" | "info" | "success" | "mock";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    mock: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  type = "button",
  onClick,
  disabled,
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50 select-none cursor-pointer";
  const sizeStyles =
    size === "sm"
      ? "rounded-md px-2.5 py-1.5 text-xs gap-1.5"
      : size === "lg"
      ? "rounded-xl px-5 py-2.5 text-base gap-2.5"
      : "rounded-lg px-4 py-2 text-sm gap-2";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-xs"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.99] dark:bg-rose-600 dark:hover:bg-rose-500 shadow-xs"
      : variant === "ghost"
      ? "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 shadow-xs";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizeStyles} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800 aria-invalid:border-rose-500 aria-invalid:focus:border-rose-500 aria-invalid:focus:ring-rose-200 dark:aria-invalid:border-rose-600 dark:aria-invalid:focus:ring-rose-950 transition-colors ${props.className ?? ""}`}
    />
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-slate-700 dark:border-t-white"
      aria-label="Loading"
      role="status"
    />
  );
}

export { Pagination, paginateItems, getPageNumbers } from "./pagination";
export type { PaginationProps } from "./pagination";
