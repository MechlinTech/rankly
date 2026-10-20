interface AuthLoadingProps {
  fullScreen?: boolean;
  label?: string;
}

/**
 * Shown while a server render is resolving the session. Keeping the public
 * page out of the initial HTML prevents the logged-out hero/nav from flashing
 * before an existing session redirects to the dashboard.
 */
export function AuthLoading({
  fullScreen = false,
  label = "Checking your session…",
}: AuthLoadingProps) {
  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950"
          : "flex min-h-[60vh] items-center justify-center px-4"
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-slate-700 dark:border-t-white"
          aria-hidden="true"
        />
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      </div>
    </div>
  );
}
