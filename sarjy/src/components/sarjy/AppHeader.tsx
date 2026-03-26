"use client";

type AppHeaderProps = {
  onOpenSettings: () => void;
  calendarConnected?: boolean;
};

export function AppHeader({
  onOpenSettings,
  calendarConnected = true,
}: AppHeaderProps) {
  return (
    <header className="shrink-0 border-b border-[var(--sarjy-border)] bg-[var(--sarjy-surface)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sarjy-accent-subtle)] text-[var(--sarjy-accent)] shadow-[var(--sarjy-shadow-soft)]"
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8 2v4M16 2v4M4 10h16M6 4h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-[var(--sarjy-text)] sm:text-lg">
              Sarjy
            </h1>
            <p className="truncate text-xs text-[var(--sarjy-muted)] sm:text-[13px]">
              AI scheduling assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
              calendarConnected
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400/95"
                : "border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-muted)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${calendarConnected ? "bg-emerald-400" : "bg-[var(--sarjy-faint)]"}`}
              aria-hidden
            />
            {calendarConnected ? "Google Calendar" : "Offline"}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-muted)] transition-colors hover:border-[var(--sarjy-border-strong)] hover:text-[var(--sarjy-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sarjy-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sarjy-bg)]"
            aria-label="Open settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82 1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
