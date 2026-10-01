"use client";

import { useState } from "react";
import { Input } from "@/components/ui";

export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18.4 18.4 0 0 1-4.1 4.4M6.1 6.7C3.8 8.3 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
