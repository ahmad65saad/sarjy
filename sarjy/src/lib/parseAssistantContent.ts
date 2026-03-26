/**
 * Best-effort parsing of assistant plain text into structured UI blocks.
 * Keeps API unchanged; improves presentation only.
 */

export type AssistantBlock =
  | {
      kind: "event_created";
      title: string;
      dateLabel: string;
      time: string;
      durationMin: number;
      rest?: string;
    }
  | {
      kind: "event_updated";
      title: string;
      changes: string;
      rest?: string;
    }
  | { kind: "event_removed"; title: string; rest?: string }
  | { kind: "availability"; status: "free" | "busy"; headline: string; detail?: string; rest?: string }
  | {
      kind: "conflict";
      timeLabel: string;
      dateLabel: string;
      conflictingWith?: string;
      rest?: string;
    }
  | { kind: "preference"; headline: string; body?: string; rest?: string }
  | { kind: "event_list"; count: number; dateLabel: string; lines: string[]; rest?: string }
  | { kind: "day_free"; dateLabel: string; rest?: string }
  | { kind: "plain"; text: string };

export function parseAssistantContent(content: string): AssistantBlock {
  const full = content.trim();

  const created = full.match(
    /^Done — "([^"]+)" is on your calendar for (.+?) at (.+?) \((\d+) min\)\.?\s*([\s\S]*)$/i,
  );
  if (created) {
    return {
      kind: "event_created",
      title: created[1],
      dateLabel: created[2].trim(),
      time: created[3].trim(),
      durationMin: Number(created[4]),
      rest: created[5]?.trim() || undefined,
    };
  }

  const updated = full.match(
    /^Done — I've updated "([^"]+)" \(changed (.+?)\)\.?\s*([\s\S]*)$/i,
  );
  if (updated) {
    return {
      kind: "event_updated",
      title: updated[1],
      changes: updated[2].trim(),
      rest: updated[3]?.trim() || undefined,
    };
  }

  const removed = full.match(/^Done — I've removed "([^"]+)" from your calendar\.?\s*([\s\S]*)$/i);
  if (removed) {
    return {
      kind: "event_removed",
      title: removed[1],
      rest: removed[2]?.trim() || undefined,
    };
  }

  const freeAt = full.match(/^You're free at (.+?) ([^\.]+)\.?\s*([\s\S]*)$/i);
  if (freeAt) {
    return {
      kind: "availability",
      status: "free",
      headline: "You're available",
      detail: `${freeAt[1].trim()} ${freeAt[2].trim()}`,
      rest: freeAt[3]?.trim() || undefined,
    };
  }

  const freeDay = full.match(/^You're free (.+?) — nothing on the calendar\.?\s*([\s\S]*)$/i);
  if (freeDay) {
    return {
      kind: "availability",
      status: "free",
      headline: "Clear calendar",
      detail: freeDay[1].trim(),
      rest: freeDay[2]?.trim() || undefined,
    };
  }

  const busyAt = full.match(/^You're busy at (.+?) ([^—]+) — (.+)$/i);
  if (busyAt) {
    return {
      kind: "availability",
      status: "busy",
      headline: "You're busy then",
      detail: `${busyAt[1].trim()} ${busyAt[2].trim()} — ${busyAt[3].trim()}`,
      rest: undefined,
    };
  }

  const conflict = full.match(
    /^Heads up — you have a conflict at (.+?) (.+?)(?:\s*\("([^"]+)"\))?\. Want me/i,
  );
  if (conflict) {
    return {
      kind: "conflict",
      timeLabel: conflict[1].trim(),
      dateLabel: conflict[2].trim(),
      conflictingWith: conflict[3],
      rest: full.includes("\n") ? full.slice(full.indexOf("\n") + 1).trim() : undefined,
    };
  }

  // Require a sentence-ending period after the date phrase so non-greedy + optional
  // "\.?" cannot capture only the first letter of words like "tomorrow." (rest was "omorrow.").
  const calFree =
    full.match(/^Your calendar is free (.+?)\.\s*([\s\S]*)$/i) ??
    full.match(/^Your calendar is free (.+)$/i);
  if (calFree && !/^You have \d+ event/i.test(full)) {
    return {
      kind: "day_free",
      dateLabel: calFree[1].trim(),
      rest: calFree[2]?.trim() || undefined,
    };
  }

  const pref =
    /^(Saved —|Updated —|I already have that saved)/i.exec(full) ||
    /^I (?:already )?have that saved/i.exec(full);
  if (pref && full.length < 400) {
    const firstLine = full.split("\n")[0];
    return {
      kind: "preference",
      headline: firstLine,
      body: full.includes("\n") ? full.slice(full.indexOf("\n") + 1).trim() : undefined,
      rest: undefined,
    };
  }

  const listMatch = full.match(/^You have (\d+) event(?:s)? ([^:\n]+):\s*\n([\s\S]+)$/i);
  if (listMatch) {
    const lines = listMatch[3]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      kind: "event_list",
      count: Number(listMatch[1]),
      dateLabel: listMatch[2].trim(),
      lines,
      rest: undefined,
    };
  }

  const listHeader = full.match(/^You have (\d+) event(?:s)? ([^:\n]+):\s*$/i);
  if (listHeader && full.split("\n").length > 1) {
    const lines = full
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      kind: "event_list",
      count: Number(listHeader[1]),
      dateLabel: listHeader[2].trim(),
      lines,
      rest: undefined,
    };
  }

  return { kind: "plain", text: full };
}
