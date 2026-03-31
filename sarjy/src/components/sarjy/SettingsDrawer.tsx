"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Voice = { name: string };

type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  ttsSupported: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  voices: Voice[];
  voiceName: string;
  onSelectVoice: (name: string) => void;
  theme: "dark" | "graphite";
  onThemeChange: (t: "dark" | "graphite") => void;
};

export function SettingsDrawer({
  open,
  onClose,
  ttsSupported,
  voiceEnabled,
  onToggleVoice,
  voices,
  voiceName,
  onSelectVoice,
  theme,
  onThemeChange,
}: SettingsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close settings"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="sarjy-settings-title"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[var(--sarjy-border)] bg-[var(--sarjy-surface)] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between border-b border-[var(--sarjy-border)] px-5 py-4">
              <h2 id="sarjy-settings-title" className="text-lg font-semibold text-[var(--sarjy-text)]">
                Settings
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[var(--sarjy-muted)] hover:bg-[var(--sarjy-elevated)] hover:text-[var(--sarjy-text)]"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6">
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-faint)]">
                  Appearance
                </h3>
                <p className="mt-1 text-sm text-[var(--sarjy-muted)]">Matte dark surfaces</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "dark" as const, label: "Obsidian" },
                      { id: "graphite" as const, label: "Graphite" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onThemeChange(opt.id)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                        theme === opt.id
                          ? "border-[var(--sarjy-accent)] bg-[var(--sarjy-accent-subtle)] text-[var(--sarjy-text)]"
                          : "border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-muted)] hover:border-[var(--sarjy-border-strong)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {ttsSupported ? (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-faint)]">
                    Voice replies
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sarjy-muted)]">
                    Speak assistant messages after each reply
                  </p>
                  <button
                    type="button"
                    onClick={onToggleVoice}
                    className={`mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      voiceEnabled
                        ? "border-[var(--sarjy-accent-border)] bg-[var(--sarjy-accent-subtle)] text-[var(--sarjy-text)]"
                        : "border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-muted)]"
                    }`}
                  >
                    <span>Read replies aloud</span>
                    <span
                      className={`relative h-6 w-11 rounded-full transition-colors ${voiceEnabled ? "bg-[var(--sarjy-accent)]" : "bg-[var(--sarjy-border)]"}`}
                      aria-hidden
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${voiceEnabled ? "left-6" : "left-1"}`}
                      />
                    </span>
                  </button>

                  {voiceEnabled && voices.length > 1 ? (
                    <label className="mt-4 block">
                      <span className="text-xs font-medium text-[var(--sarjy-muted)]">Voice</span>
                      <select
                        value={voiceName}
                        onChange={(e) => onSelectVoice(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] px-3 py-2.5 text-sm text-[var(--sarjy-text)] outline-none focus:border-[var(--sarjy-accent)] focus:ring-2 focus:ring-[var(--sarjy-ring)]"
                      >
                        {voices.map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </section>
              ) : (
                <p className="text-sm text-[var(--sarjy-muted)]">
                  Text-to-speech is not supported in this browser.
                </p>
              )}

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-faint)]">
                  Tips
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--sarjy-muted)] leading-relaxed">
                  <li>
                    <strong className="text-[var(--sarjy-text)]">Deployed site:</strong> must be{" "}
                    <code className="rounded bg-[var(--sarjy-elevated)] px-1 text-xs">https://</code>
                    . Allow mic when the browser asks.
                  </li>
                  <li>
                    Read-aloud is on by default; turn it off here if a device stays silent (try tapping
                    Send once first on iOS).
                  </li>
                  <li>Use the mic for hands-free scheduling (Chrome/Edge on desktop or Android).</li>
                  <li>Say &ldquo;that meeting&rdquo; to update your last event.</li>
                </ul>
              </section>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
