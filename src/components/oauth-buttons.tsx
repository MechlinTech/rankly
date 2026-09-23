export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-2">
      <a
        href="/api/auth/oauth/google/start"
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Continue with Google
      </a>
      <a
        href="/api/auth/oauth/microsoft/start"
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Continue with Microsoft
      </a>
    </div>
  );
}
