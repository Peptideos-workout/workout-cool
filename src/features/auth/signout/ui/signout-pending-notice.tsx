interface SignoutPendingNoticeProps {
  label: string;
}

/** Large status shown while hop B finishes. No button — the form submits itself. */
export function SignoutPendingNotice({ label }: SignoutPendingNoticeProps) {
  return (
    <div className="flex flex-col items-center gap-5" role="status">
      <h1 className="max-w-md text-balance text-4xl font-semibold tracking-tight">{label}</h1>
      <div
        aria-hidden="true"
        className="size-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900 dark:border-slate-700 dark:border-t-slate-100"
      />
    </div>
  );
}
