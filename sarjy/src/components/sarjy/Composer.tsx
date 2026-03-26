"use client";

import type { RefObject } from "react";

type ComposerProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  isListening: boolean;
  micSupported: boolean;
  micEnabled: boolean;
  onToggleMic: () => void;
  micError: string | null;
  isSpeaking: boolean;
  onStopSpeaking: () => void;
};

export function Composer({
  inputRef,
  value,
  onChange,
  onSubmit,
  loading,
  isListening,
  micSupported,
  micEnabled,
  onToggleMic,
  micError,
  isSpeaking,
  onStopSpeaking,
}: ComposerProps) {
  const busy = loading || isListening;

  return (
    <div className="border-t border-[var(--sarjy-border)] bg-[var(--sarjy-surface)]/90 px-4 py-4 backdrop-blur-md sm:px-6">
      <form
        className="mx-auto flex max-w-5xl flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {micError ? (
          <p className="text-center text-xs text-rose-400/90 sm:text-left">{micError}</p>
        ) : null}
        <div className="flex items-stretch gap-2 sm:gap-3">
          <div
            className={[
              "relative flex min-h-[52px] flex-1 items-center rounded-2xl border bg-[var(--sarjy-elevated)] transition-[box-shadow,border-color] duration-200",
              busy
                ? "border-[var(--sarjy-accent)]/40 shadow-[0_0_0_3px_var(--sarjy-ring)]"
                : "border-[var(--sarjy-border)] shadow-[var(--sarjy-shadow-soft)] focus-within:border-[var(--sarjy-border-strong)] focus-within:shadow-[0_0_0_3px_var(--sarjy-ring)]",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              className="h-full min-h-[52px] w-full rounded-2xl bg-transparent px-4 py-3 text-[15px] text-[var(--sarjy-text)] placeholder:text-[var(--sarjy-faint)] outline-none disabled:opacity-50"
              placeholder={
                isListening
                  ? "Listening… you can still type"
                  : loading
                    ? "Sarjy is replying…"
                    : "Message Sarjy…"
              }
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={loading}
              aria-busy={loading}
            />
            {isListening ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                </span>
                Mic
              </span>
            ) : null}
          </div>

          {micSupported ? (
            <button
              type="button"
              onClick={onToggleMic}
              title={micEnabled ? "Turn microphone off" : "Turn microphone on"}
              className={[
                "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border transition-colors",
                micEnabled
                  ? isListening
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-400/90"
                  : "border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-muted)] hover:text-[var(--sarjy-text)]",
              ].join(" ")}
            >
              {micEnabled ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0M12 19v2M8 21h8"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ) : (
            <span
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border border-[var(--sarjy-border)] bg-[var(--sarjy-bg)] text-[var(--sarjy-faint)]"
              title="Speech recognition not available"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.35"
                />
              </svg>
            </span>
          )}

          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="flex h-[52px] min-w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[var(--sarjy-accent)] px-5 text-sm font-semibold text-white shadow-[var(--sarjy-shadow-soft)] transition-[transform,opacity,filter] hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:min-w-[100px]"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              "Send"
            )}
          </button>
        </div>

        {isSpeaking ? (
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <span className="text-xs text-[var(--sarjy-muted)]">Speaking…</span>
            <button
              type="button"
              onClick={onStopSpeaking}
              className="text-xs font-medium text-[var(--sarjy-accent)] hover:underline"
            >
              Stop
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
