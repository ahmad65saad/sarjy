"use client";

import { motion } from "framer-motion";

const SUGGESTIONS = [
  "What do I have tomorrow?",
  "Schedule a meeting",
  "Am I free at 2 PM?",
  "Show my preferences",
] as const;

type EmptyStateProps = {
  onPick: (text: string) => void;
  disabled?: boolean;
};

export function EmptyState({ onPick, disabled }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-md"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sarjy-faint)]">
          Welcome
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--sarjy-text)] sm:text-3xl">
          Your calendar, one conversation away
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--sarjy-muted)] sm:text-[15px]">
          Ask in plain language. Sarjy checks availability, books events, and remembers how you like to
          work—by voice or typing.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10 flex w-full max-w-lg flex-wrap justify-center gap-2"
      >
        {SUGGESTIONS.map((label, i) => (
          <motion.button
            key={label}
            type="button"
            disabled={disabled}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.05, duration: 0.3 }}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => onPick(label)}
            className="rounded-full border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--sarjy-text)] shadow-[var(--sarjy-shadow-soft)] transition-colors hover:border-[var(--sarjy-border-strong)] hover:bg-[var(--sarjy-surface)] disabled:opacity-50"
          >
            {label}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
