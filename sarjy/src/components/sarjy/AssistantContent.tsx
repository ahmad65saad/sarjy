"use client";

import type { ReactNode } from "react";
import type { AssistantBlock } from "@/lib/parseAssistantContent";

function CardShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] p-4 shadow-[var(--sarjy-shadow-soft)] ${className}`}
    >
      {children}
    </div>
  );
}

export function AssistantContent({ block }: { block: AssistantBlock }) {
  if (block.kind === "plain") {
    return (
      <p className="text-[15px] leading-relaxed text-[var(--sarjy-text)] whitespace-pre-wrap">
        {block.text}
      </p>
    );
  }

  if (block.kind === "event_created") {
    return (
      <div className="space-y-3">
        <CardShell className="border-[var(--sarjy-accent-border)] bg-[var(--sarjy-accent-subtle)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-accent)]">
            Event scheduled
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--sarjy-text)]">
            {block.title}
          </h3>
          <dl className="mt-3 grid gap-2 text-sm text-[var(--sarjy-muted)]">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--sarjy-faint)]">When</dt>
              <dd className="text-right text-[var(--sarjy-text)]">
                {block.dateLabel} · {block.time}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--sarjy-faint)]">Duration</dt>
              <dd className="text-[var(--sarjy-text)]">{block.durationMin} min</dd>
            </div>
          </dl>
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === "event_updated") {
    return (
      <div className="space-y-3">
        <CardShell className="border-[var(--sarjy-accent-border)] bg-[var(--sarjy-accent-subtle)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-accent)]">
            Event updated
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--sarjy-text)]">{block.title}</h3>
          <p className="mt-2 text-sm text-[var(--sarjy-muted)]">Changes: {block.changes}</p>
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === "event_removed") {
    return (
      <div className="space-y-3">
        <CardShell>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-faint)]">
            Removed from calendar
          </p>
          <p className="mt-1 text-base font-medium text-[var(--sarjy-text)]">{block.title}</p>
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === "availability") {
    const positive = block.status === "free";
    return (
      <div className="space-y-3">
        <CardShell
          className={
            positive
              ? "border-emerald-500/25 bg-emerald-500/[0.07]"
              : "border-rose-500/25 bg-rose-500/[0.07]"
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${positive ? "bg-emerald-400" : "bg-rose-400"}`}
              aria-hidden
            />
            <p
              className={`text-[11px] font-semibold uppercase tracking-wider ${positive ? "text-emerald-400/90" : "text-rose-400/90"}`}
            >
              {positive ? "Available" : "Busy"}
            </p>
          </div>
          <p className="mt-2 text-lg font-semibold text-[var(--sarjy-text)]">{block.headline}</p>
          {block.detail ? (
            <p className="mt-1 text-sm text-[var(--sarjy-muted)]">{block.detail}</p>
          ) : null}
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === "conflict") {
    return (
      <div className="space-y-3">
        <CardShell className="border-amber-500/30 bg-amber-500/[0.06]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/90">
            Scheduling conflict
          </p>
          <p className="mt-2 text-base font-semibold text-[var(--sarjy-text)]">
            {block.timeLabel} · {block.dateLabel}
          </p>
          {block.conflictingWith ? (
            <p className="mt-2 text-sm text-[var(--sarjy-muted)]">
              Overlaps with &ldquo;{block.conflictingWith}&rdquo;
            </p>
          ) : null}
          <p className="mt-3 text-sm text-[var(--sarjy-muted)] leading-relaxed">
            You can confirm anyway or pick another time.
          </p>
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === "preference") {
    return (
      <CardShell className="border-violet-500/20 bg-violet-500/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/90">
          Preference
        </p>
        <p className="mt-2 text-sm font-medium text-[var(--sarjy-text)] leading-relaxed">
          {block.headline}
        </p>
        {block.body ? (
          <p className="mt-2 text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.body}</p>
        ) : null}
      </CardShell>
    );
  }

  if (block.kind === "event_list") {
    return (
      <CardShell>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sarjy-faint)]">
          Upcoming · {block.dateLabel}
        </p>
        <p className="mt-1 text-lg font-semibold text-[var(--sarjy-text)]">
          {block.count} event{block.count === 1 ? "" : "s"}
        </p>
        <ul className="mt-3 space-y-2 border-t border-[var(--sarjy-border)] pt-3">
          {block.lines.map((line, i) => (
            <li
              key={`${i}-${line.slice(0, 24)}`}
              className="text-sm text-[var(--sarjy-muted)] leading-relaxed pl-1 border-l-2 border-[var(--sarjy-border)]"
            >
              {line.replace(/^•\s*/, "")}
            </li>
          ))}
        </ul>
      </CardShell>
    );
  }

  if (block.kind === "day_free") {
    return (
      <div className="space-y-3">
        <CardShell className="border-emerald-500/25 bg-emerald-500/[0.07]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">
            Free day
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--sarjy-text)]">
            Nothing on {block.dateLabel}
          </p>
        </CardShell>
        {block.rest ? (
          <p className="text-sm text-[var(--sarjy-muted)] whitespace-pre-wrap">{block.rest}</p>
        ) : null}
      </div>
    );
  }

  return null;
}
