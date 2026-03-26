"use client";

import { motion } from "framer-motion";

export function ThinkingIndicator() {
  return (
    <div className="flex max-w-[min(100%,520px)] justify-start">
      <div className="rounded-2xl border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] px-4 py-3 shadow-[var(--sarjy-shadow-soft)]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--sarjy-muted)]">Thinking</span>
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[var(--sarjy-accent)]"
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  delay: i * 0.18,
                  ease: "easeInOut",
                }}
              />
            ))}
          </span>
        </div>
        <motion.div
          className="mt-2 h-0.5 overflow-hidden rounded-full bg-[var(--sarjy-border)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-[var(--sarjy-accent)]/60"
            animate={{ x: ["-100%", "280%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}
