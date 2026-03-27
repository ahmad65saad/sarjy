import { parseIntent, type ParsedIntent } from "@/lib/intentParser";
import { listEventsForDateParam } from "@/app/api/calendar/events/route";
import {
  createCalendarEvent,
  resolveTime,
  formatTimeForDisplay,
} from "@/app/api/calendar/create/route";
import { updateCalendarEvent, deleteCalendarEvent } from "@/app/api/calendar/update/route";
import {
  savePreference,
  getPreferences,
  saveConversationMessage,
} from "@/lib/memory";

const USER_ID = "demo-user";

type PendingAction = {
  intent?: string;
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
  awaitingConfirmation?: boolean;
  /** Set when asking "schedule anyway?" after a real calendar conflict; cleared after confirm or new time. */
  awaitingConflictAck?: boolean;
};

type LastEvent = { id: string; summary: string; start: string; end: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Preference key normalization ─────────────────────────────────────

const PREF_KEY_MAP: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /duration|length|long|minutes/i, canonical: "default_meeting_duration" },
  { pattern: /meet.*time|time.*meet|start.*time|prefer.*time|schedul.*time/i, canonical: "preferred_meeting_start_time" },
];

function normalizePreferenceKey(raw: string): string {
  for (const { pattern, canonical } of PREF_KEY_MAP) {
    if (pattern.test(raw)) return canonical;
  }
  return raw;
}

// ── Slot-filling helpers ────────────────────────────────────────────

const SIDE_INTENT_TYPES = new Set([
  "check_availability",
  "list_events",
  "create_reminder",
  "check_conflict",
  "save_preference",
  "get_preferences",
  "delete_event",
]);

function isContinuation(message: string, parsedIntent: ParsedIntent): boolean {
  if (SIDE_INTENT_TYPES.has(parsedIntent.intent)) return false;
  if (parsedIntent.intent === "create_event") return true;
  if (message.trim().split(/\s+/).length <= 4) {
    const hasSchedulingInfo = Boolean(
      parsedIntent.date || parsedIntent.time || parsedIntent.title || parsedIntent.duration_minutes
    );
    if (hasSchedulingInfo) return true;
    if (parsedIntent.intent === "general_chat") return false;
    return true;
  }
  return false;
}

const CONFIRM_YES = /^\s*(yes|yeah|yep|sure|ok|okay|yea|do it|book it|go ahead|confirm|let'?s do it)\s*[.!]?\s*$/i;
const CONFIRM_NO = /^\s*(no|nah|nope|not really|different time|no thanks|not now|not that|actually no)\s*[.!]?\s*$/i;
const CONFIRM_CANCEL = /^\s*(cancel|never\s*mind|forget\s*it|don'?t|stop|nvm)\s*[.!]?\s*$/i;

const RESUME_PATTERN =
  /\b(ok|okay|sure|yeah|yes|then|instead|make it|do it|book it|do|let'?s do|change it to|switch to)\b/i;

function shouldResumePendingCreateDraft(
  message: string,
  parsedIntent: ParsedIntent,
): boolean {
  if (parsedIntent.intent === "create_event") return true;

  const hasResumePhrase = RESUME_PATTERN.test(message);
  const hasTimeOrDate = Boolean(parsedIntent.time || parsedIntent.date || parsedIntent.duration_minutes);
  const isShort = message.trim().split(/\s+/).length <= 8;

  if (hasResumePhrase && hasTimeOrDate && isShort) return true;

  // "update_event" when a draft exists is almost always about the draft
  if (parsedIntent.intent === "update_event" && hasTimeOrDate && isShort) return true;

  return false;
}

/** Fill empty slots from fresh (for initial slot-filling). */
function mergeSlots(pending: PendingAction, fresh: ParsedIntent): PendingAction {
  return {
    intent: pending.intent ?? fresh.intent,
    title: pending.title ?? fresh.title,
    date: pending.date ?? fresh.date,
    time: pending.time ?? fresh.time,
    duration_minutes: pending.duration_minutes ?? fresh.duration_minutes,
  };
}

/** Fresh fields OVERRIDE existing ones (for modifications like "make it 11am"). */
function mergeSlotsOverride(pending: PendingAction, fresh: ParsedIntent): PendingAction {
  return {
    intent: pending.intent,
    title: fresh.title ?? pending.title,
    date: fresh.date ?? pending.date,
    time: fresh.time ?? pending.time,
    duration_minutes: fresh.duration_minutes ?? pending.duration_minutes,
  };
}

function missingCreateEventFields(action: PendingAction): string[] {
  const missing: string[] = [];
  if (!action.title) missing.push("title");
  if (!action.date) missing.push("date");
  if (!action.time) missing.push("time");
  return missing;
}

// ── Confirmation classifier via OpenAI ───────────────────────────────

async function classifyConfirmation(message: string): Promise<"yes" | "no" | "cancel" | "unknown"> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "unknown";

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      instructions:
        'The user was asked to confirm scheduling a calendar event. Classify their reply as exactly one of: "yes", "no", or "cancel". "yes" means they agree. "no" means they want a different option. "cancel" means they want to stop entirely (e.g. never mind, forget it, skip, nvm). Return ONLY the single word: yes, no, or cancel.',
      input: [{ role: "user", content: message }],
    });

    const outputText =
      typeof (res as { output_text?: unknown }).output_text === "string"
        ? (res as { output_text: string }).output_text.trim().toLowerCase()
        : "";

    if (outputText === "yes" || outputText === "no" || outputText === "cancel") return outputText;
    return "unknown";
  } catch {
    return "unknown";
  }
}

// ── Fallback slot extraction via OpenAI ──────────────────────────────

async function extractSlotsFallback(
  message: string,
  pending: PendingAction,
): Promise<{ date?: string; time?: string; duration_minutes?: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const missing = [
      !pending.date ? "date" : null,
      !pending.time ? "time" : null,
    ].filter(Boolean).join(", ");

    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      instructions:
        `The user is scheduling a calendar event and just replied with additional info. Extract ONLY valid JSON with these fields if present: { date?: string, time?: string, duration_minutes?: number }. For date, normalize to "today" or "tomorrow" or a weekday name. For time, return the full expression like "10 AM" or "4:30 PM". Handle misspellings and shorthand (e.g. "tmrw" = "tomorrow", "tdy" = "today", "2moro" = "tomorrow"). Missing fields from the draft: ${missing}. Return ONLY JSON, no markdown.`,
      input: [{ role: "user", content: message }],
    });

    const outputText =
      typeof (res as { output_text?: unknown }).output_text === "string"
        ? (res as { output_text: string }).output_text
        : "";

    if (!outputText.trim()) return null;

    const start = outputText.indexOf("{");
    const end = outputText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    const data = JSON.parse(outputText.slice(start, end + 1));
    const hasFields = data.date || data.time || data.duration_minutes;
    return hasFields ? data : null;
  } catch {
    return null;
  }
}

// ── Preference-aware time helpers ────────────────────────────────────

/** Parse preference values like "after 2 PM", "2 PM", "14:00" into hours/minutes. */
async function parsePreferredTime(pref: string): Promise<{ hours: number; minutes: number } | null> {
  const cleaned = pref.replace(/^(after|before|around|at)\s+/i, "").trim();
  try {
    return await resolveTime(cleaned);
  } catch {
    return null;
  }
}

type CalEvent = { id: string; summary: string; start: string; end: string };

/** Extract hours and minutes from an ISO dateTime string (e.g. "2026-03-27T14:30:00+03:00"). */
function extractHM(iso: string): { h: number; m: number } | null {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

function isSlotBusy(
  events: CalEvent[],
  hours: number,
  minutes: number,
  durationMinutes: number,
  excludeEventId?: string,
): boolean {
  const slotStart = hours * 60 + minutes;
  const slotEnd = slotStart + durationMinutes;

  return events.some((e) => {
    if (excludeEventId && e.id === excludeEventId) return false;
    const s = extractHM(e.start);
    const eEnd = extractHM(e.end);
    if (!s || !eEnd) return false;
    const evStart = s.h * 60 + s.m;
    const evEnd = eEnd.h * 60 + eEnd.m;
    return slotStart < evEnd && slotEnd > evStart;
  });
}

/** Natural language duration, e.g. "30 minutes", "1 hour", "1 hour 30 minutes". */
function formatDurationNatural(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 minutes";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return m === 1 ? "1 minute" : `${m} minutes`;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  const hourPart = h === 1 ? "1 hour" : `${h} hours`;
  const minPart = m === 1 ? "1 minute" : `${m} minutes`;
  return `${hourPart} ${minPart}`;
}

function eventDurationMinutes(e: CalEvent): number {
  try {
    const a = new Date(e.start).getTime();
    const b = new Date(e.end).getTime();
    const diff = Math.round((b - a) / 60000);
    return diff > 0 ? diff : 30;
  } catch {
    return 30;
  }
}

/** First calendar event that overlaps the query window [queryStartMin, queryEndMin) in minutes-of-day. */
function findFirstOverlappingEvent(
  events: CalEvent[],
  queryStartMin: number,
  queryEndMin: number,
): CalEvent | null {
  for (const e of events) {
    const s = extractHM(e.start);
    const eEnd = extractHM(e.end);
    if (!s || !eEnd) continue;
    const startMin = s.h * 60 + s.m;
    const endMin = eEnd.h * 60 + eEnd.m;
    if (queryStartMin < endMin && queryEndMin > startMin) return e;
  }
  return null;
}

/** Walk forward in 30-min increments from startHours:startMinutes to find a free slot. */
function findNextFreeSlot(
  events: CalEvent[],
  startHours: number,
  startMinutes: number,
  durationMinutes: number,
): { hours: number; minutes: number } | null {
  let h = startHours;
  let m = startMinutes;

  for (let i = 0; i < 20; i++) {
    m += 30;
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    if (h >= 22) return null;
    if (!isSlotBusy(events, h, m, durationMinutes)) return { hours: h, minutes: m };
  }
  return null;
}

// ── create_event handler ────────────────────────────────────────────

async function handleCreateEvent(
  action: PendingAction,
  opts?: { skipConflictCheck?: boolean },
) {
  // Fetch preferences once and resolve duration + preferred time from them
  let allPrefs: Array<{ key: string; value: string }> = [];
  try {
    allPrefs = await getPreferences(USER_ID);
  } catch {
    // preference lookup failed — continue with defaults
  }

  let duration = action.duration_minutes;
  if (!duration) {
    const durPref = allPrefs.find(
      (p) => /duration|length/i.test(p.key),
    );
    if (durPref) {
      const m = durPref.value.match(/(\d+)/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (parsed > 0) duration = parsed;
      }
    }
  }
  if (!duration) duration = 30;

  // If title + date are present but time is missing, try preference
  if (action.title && action.date && !action.time) {
    try {
      const timePref = allPrefs.find(
        (p) => /meet|time|start|schedul/i.test(p.key) && !/duration|length/i.test(p.key),
      );
      const prefValue = timePref?.value ?? null;
      if (prefValue) {
        const parsed = await parsePreferredTime(prefValue);
        if (parsed) {
          const { events } = await listEventsForDateParam(action.date);
          const prefDisplay = formatTimeForDisplay(parsed.hours, parsed.minutes);
          const timeStr = `${parsed.hours % 12 || 12}${parsed.minutes ? `:${String(parsed.minutes).padStart(2, "0")}` : ""} ${parsed.hours >= 12 ? "PM" : "AM"}`;

          if (!isSlotBusy(events, parsed.hours, parsed.minutes, duration)) {
            const draft = { ...action, time: timeStr, duration_minutes: duration, awaitingConfirmation: true };
            return json({
              content: `You prefer meetings ${prefValue.toLowerCase()}. Want me to schedule "${action.title}" for ${action.date} at ${prefDisplay} (${duration} min)?`,
              parsedIntent: draft,
              pendingAction: draft,
            });
          }

          const next = findNextFreeSlot(events, parsed.hours, parsed.minutes, duration);
          if (next) {
            const nextDisplay = formatTimeForDisplay(next.hours, next.minutes);
            const nextTimeStr = `${next.hours % 12 || 12}${next.minutes ? `:${String(next.minutes).padStart(2, "0")}` : ""} ${next.hours >= 12 ? "PM" : "AM"}`;
            const draft = { ...action, time: nextTimeStr, duration_minutes: duration, awaitingConfirmation: true };
            return json({
              content: `You prefer meetings ${prefValue.toLowerCase()}, but ${prefDisplay} is busy. The next free slot is ${nextDisplay}. Want me to book it then (${duration} min)?`,
              parsedIntent: draft,
              pendingAction: draft,
            });
          }

          return json({
            content: `You prefer meetings ${prefValue.toLowerCase()}, but ${prefDisplay} and the following slots are all busy ${action.date}. What time works for you?`,
            parsedIntent: action,
            pendingAction: action,
          });
        }
      }
    } catch {
      // Preference lookup failed — fall through to normal behavior
    }
  }

  const missing = missingCreateEventFields(action);

  if (missing.length > 0) {
    return json({
      content: `I'd love to schedule that — I just need the ${missing.join(", ")}.`,
      parsedIntent: action,
      pendingAction: action,
    });
  }

  // Resolve time + fetch events in parallel (both are cached so downstream calls are free)
  if (
    !action.awaitingConfirmation &&
    action.time &&
    action.date &&
    !opts?.skipConflictCheck
  ) {
    try {
      const [timeParsed, eventsResult] = await Promise.all([
        resolveTime(action.time),
        listEventsForDateParam(action.date),
      ]);

      const { hours: cH, minutes: cM } = timeParsed;
      const { events } = eventsResult;

      if (isSlotBusy(events, cH, cM, duration)) {
        const displayTime = formatTimeForDisplay(cH, cM);
        const conflicting = events.find((e) => {
          const s = extractHM(e.start);
          const eEnd = extractHM(e.end);
          if (!s || !eEnd) return false;
          const evStart = s.h * 60 + s.m;
          const evEnd = eEnd.h * 60 + eEnd.m;
          const slotStart = cH * 60 + cM;
          return slotStart < evEnd && (slotStart + duration) > evStart;
        });

        const conflictInfo = conflicting ? ` ("${conflicting.summary}")` : "";
        const draft = {
          ...action,
          duration_minutes: duration,
          awaitingConfirmation: true,
          awaitingConflictAck: true,
        };

        return json({
          content: `Heads up — you have a conflict at ${displayTime} ${action.date}${conflictInfo}. Want me to schedule it anyway, or pick a different time?`,
          parsedIntent: draft,
          pendingAction: draft,
        });
      }
    } catch {
      // resolve or conflict check failed — proceed with creation
    }
  }

  try {
    const event = await createCalendarEvent({
      title: action.title,
      date: action.date,
      time: action.time,
      duration_minutes: duration,
    });

    const startTime = await (async () => {
      try {
        const { hours, minutes } = await resolveTime(action.time!);
        return formatTimeForDisplay(hours, minutes);
      } catch {
        return action.time;
      }
    })();

    const content = `Done — "${event.summary}" is on your calendar for ${action.date} at ${startTime} (${duration} min).`;

    return json({
      content,
      parsedIntent: { ...action, awaitingConfirmation: false },
      pendingAction: null,
      lastEvent: { id: event.id, summary: event.summary, start: event.start, end: event.end },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return json({
      content: `I tried to create that event but hit an error: ${msg}`,
      parsedIntent: action,
      pendingAction: null,
    });
  }
}

// ── check_availability handler ──────────────────────────────────────

async function handleCheckAvailability(
  parsedIntent: ParsedIntent,
  pending: PendingAction | undefined,
) {
  const date = parsedIntent.date ?? "tomorrow";
  const timeStr = parsedIntent.time;

  // Absorb the date from this query into the pending draft so the user
  // can say "ok make it 11am then" and we already know the date.
  const updatedPending =
    pending?.intent === "create_event"
      ? { ...pending, date: pending.date ?? date }
      : pending ?? null;

  try {
    const { events } = await listEventsForDateParam(date);

    if (!timeStr) {
      if (events.length === 0) {
        return json({ content: `You're free ${date} — nothing on the calendar.`, parsedIntent, pendingAction: updatedPending });
      }
      const lines = events.map((e) => {
        const hm = extractHM(e.start);
        if (!hm) return `• ${e.summary}`;
        const t = formatTimeForDisplay(hm.h, hm.m);
        return `• ${t} — ${e.summary}`;
      });
      return json({
        content: `You have ${events.length} event${events.length === 1 ? "" : "s"} ${date}:\n${lines.join("\n")}`,
        parsedIntent,
        pendingAction: updatedPending,
      });
    }

    const { hours: qH, minutes: qM } = await resolveTime(timeStr);
    const defaultDuration = 30;
    const queryStart = qH * 60 + qM;
    const queryEnd = queryStart + defaultDuration;

    const displayTime = formatTimeForDisplay(qH, qM);
    const conflict = findFirstOverlappingEvent(events, queryStart, queryEnd);

    if (conflict) {
      const sh = extractHM(conflict.start);
      const eh = extractHM(conflict.end);
      const title = conflict.summary || "Event";
      const durMin = eventDurationMinutes(conflict);
      const durationText = formatDurationNatural(durMin);

      if (sh && eh) {
        const startDisp = formatTimeForDisplay(sh.h, sh.m);
        const endDisp = formatTimeForDisplay(eh.h, eh.m);
        const content = `You're busy at ${displayTime} ${date} — you have '${title}' from ${startDisp} to ${endDisp} (${durationText}).`;
        return json({
          content,
          parsedIntent,
          pendingAction: updatedPending,
          availability: {
            available: false,
            conflict: {
              summary: conflict.summary || "Event",
              start: conflict.start,
              end: conflict.end,
              durationText,
            },
          },
        });
      }

      return json({
        content: `You're busy at ${displayTime} ${date} — you have '${title}' on the calendar (${durationText}).`,
        parsedIntent,
        pendingAction: updatedPending,
        availability: {
          available: false,
          conflict: {
            summary: conflict.summary || "Event",
            start: conflict.start,
            end: conflict.end,
            durationText,
          },
        },
      });
    }

    return json({
      content: `You're free at ${displayTime} ${date}.`,
      parsedIntent,
      pendingAction: updatedPending,
      availability: { available: true },
    });
  } catch {
    return json({
      content: `Sorry, I could only check today or tomorrow for now. Try "am I free tomorrow at 10 AM?"`,
      parsedIntent,
      pendingAction: updatedPending,
    });
  }
}

// ── update_event handler ─────────────────────────────────────────────

async function handleUpdateEvent(
  parsedIntent: ParsedIntent,
  lastEvent: LastEvent | null,
  message: string,
) {
  let target: CalEvent | null = null;

  if (lastEvent) {
    const lower = message.toLowerCase();
    const refsLast =
      /\b(that|the|this|it)\b/i.test(lower) || !parsedIntent.title;
    const titleMatch =
      parsedIntent.title &&
      lastEvent.summary.toLowerCase().includes(parsedIntent.title.toLowerCase());

    if (refsLast || titleMatch) {
      target = lastEvent;
    }
  }

  if (!target && (parsedIntent.title || parsedIntent.date)) {
    const searchDate = parsedIntent.date || "today";
    try {
      const { events } = await listEventsForDateParam(searchDate);

      if (parsedIntent.title) {
        const titleLower = parsedIntent.title.toLowerCase();
        const matches = events.filter(
          (e) =>
            e.summary.toLowerCase().includes(titleLower) ||
            titleLower.includes(e.summary.toLowerCase()),
        );

        if (matches.length === 1) {
          target = matches[0];
        } else if (matches.length > 1) {
          const list = matches
            .map((e) => {
              const hm = extractHM(e.start);
              const t = hm ? formatTimeForDisplay(hm.h, hm.m) : "";
              return t ? `• ${t} — "${e.summary}"` : `• "${e.summary}"`;
            })
            .join("\n");
          return respond(
            {
              content: `I found multiple events that could match:\n${list}\nWhich one did you mean?`,
              parsedIntent,
              pendingAction: null,
            },
            message,
          );
        }
      } else if (events.length === 1) {
        target = events[0];
      }
    } catch {
      // search failed
    }
  }

  if (!target) {
    return respond(
      {
        content:
          "I'm not sure which event you want to update. Can you tell me the event name or when it is?",
        parsedIntent,
        pendingAction: null,
      },
      message,
    );
  }

  const hasChanges =
    parsedIntent.time ||
    parsedIntent.date ||
    parsedIntent.duration_minutes ||
    (parsedIntent.title &&
      parsedIntent.title.toLowerCase() !== target.summary.toLowerCase());

  if (!hasChanges) {
    return respond(
      {
        content: `Sure — what would you like to change about "${target.summary}"?`,
        parsedIntent,
        pendingAction: null,
        lastEvent: target,
      },
      message,
    );
  }

  try {
    const updated = await updateCalendarEvent({
      eventId: target.id,
      title:
        parsedIntent.title &&
        parsedIntent.title.toLowerCase() !== target.summary.toLowerCase()
          ? parsedIntent.title
          : undefined,
      date: parsedIntent.date,
      time: parsedIntent.time,
      duration_minutes: parsedIntent.duration_minutes,
    });

    const changes: string[] = [];
    if (parsedIntent.duration_minutes)
      changes.push(`duration to ${parsedIntent.duration_minutes} min`);
    if (parsedIntent.time) {
      try {
        const { hours, minutes } = await resolveTime(parsedIntent.time);
        changes.push(`time to ${formatTimeForDisplay(hours, minutes)}`);
      } catch {
        changes.push(`time to ${parsedIntent.time}`);
      }
    }
    if (parsedIntent.date) changes.push(`date to ${parsedIntent.date}`);

    const changeStr = changes.length > 0 ? changes.join(" and ") : "the details";

    return respond(
      {
        content: `Done — I've updated "${updated.summary}" (changed ${changeStr}).`,
        parsedIntent,
        pendingAction: null,
        lastEvent: {
          id: updated.id,
          summary: updated.summary,
          start: updated.start,
          end: updated.end,
        },
      },
      message,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return respond(
      {
        content: `I tried to update that event but hit an error: ${msg}`,
        parsedIntent,
        pendingAction: null,
      },
      message,
    );
  }
}

// ── delete_event handler ─────────────────────────────────────────────

async function handleDeleteEvent(
  parsedIntent: ParsedIntent,
  lastEvent: LastEvent | null,
  message: string,
) {
  let target: CalEvent | null = null;

  if (lastEvent) {
    const lower = message.toLowerCase();
    const refsLast =
      /\b(that|the|this|it)\b/i.test(lower) || !parsedIntent.title;
    const titleMatch =
      parsedIntent.title &&
      lastEvent.summary.toLowerCase().includes(parsedIntent.title.toLowerCase());

    if (refsLast || titleMatch) {
      target = lastEvent;
    }
  }

  if (!target && (parsedIntent.title || parsedIntent.date)) {
    const searchDate = parsedIntent.date || "today";
    try {
      const { events } = await listEventsForDateParam(searchDate);

      if (parsedIntent.title) {
        const titleLower = parsedIntent.title.toLowerCase();
        const matches = events.filter(
          (e) =>
            e.summary.toLowerCase().includes(titleLower) ||
            titleLower.includes(e.summary.toLowerCase()),
        );

        if (matches.length === 1) {
          target = matches[0];
        } else if (matches.length > 1) {
          const list = matches
            .map((e) => {
              const hm = extractHM(e.start);
              const t = hm ? formatTimeForDisplay(hm.h, hm.m) : "";
              return t ? `• ${t} — "${e.summary}"` : `• "${e.summary}"`;
            })
            .join("\n");
          return respond(
            {
              content: `I found multiple events that could match:\n${list}\nWhich one should I delete?`,
              parsedIntent,
              pendingAction: null,
            },
            message,
          );
        }
      } else if (events.length === 1) {
        target = events[0];
      }
    } catch {
      // search failed
    }
  }

  if (!target) {
    return respond(
      {
        content:
          "I'm not sure which event to delete. Can you tell me the event name or when it is?",
        parsedIntent,
        pendingAction: null,
      },
      message,
    );
  }

  try {
    await deleteCalendarEvent(target.id);
    return respond(
      {
        content: `Done — I've removed "${target.summary}" from your calendar.`,
        parsedIntent,
        pendingAction: null,
        lastEvent: null,
      },
      message,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return respond(
      {
        content: `I tried to delete that event but hit an error: ${msg}`,
        parsedIntent,
        pendingAction: null,
      },
      message,
    );
  }
}

// ── Conversation logging (fire-and-forget) ──────────────────────────

function logConversation(userMsg: string, assistantMsg: string) {
  saveConversationMessage(USER_ID, "user", userMsg).catch(() => {});
  saveConversationMessage(USER_ID, "assistant", assistantMsg).catch(() => {});
}

function respond(
  data: { content: string; [key: string]: unknown },
  userMsg: string,
  status = 200,
) {
  logConversation(userMsg, data.content);
  return json(data, status);
}

// ── Main POST handler ───────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      message?: unknown;
      messages?: Array<{ role: string; content: string }>;
      pendingAction?: PendingAction;
      lastEvent?: LastEvent | null;
    };

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return json({ content: "Please send a message." }, 400);
    }

    const parsedIntent: ParsedIntent = await parseIntent(message);
    const pending = body.pendingAction;

    // ── Awaiting confirmation (preference suggestion) ────────────────
    if (pending?.awaitingConfirmation && pending.intent === "create_event") {
      if (CONFIRM_YES.test(message)) {
        const { awaitingConflictAck, ...rest } = pending;
        const res = await handleCreateEvent(
          { ...rest, awaitingConfirmation: false },
          { skipConflictCheck: awaitingConflictAck === true },
        );
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }

      if (CONFIRM_CANCEL.test(message)) {
        return respond(
          { content: "No worries — I've cancelled that.", parsedIntent, pendingAction: null },
          message,
        );
      }

      if (CONFIRM_NO.test(message) || parsedIntent.time) {
        const draft: PendingAction = {
          ...pending,
          awaitingConfirmation: false,
          awaitingConflictAck: false,
          time: parsedIntent.time ?? undefined,
        };
        if (parsedIntent.time) {
          const res = await handleCreateEvent(draft);
          logConversation(message, JSON.parse(await res.clone().text()).content);
          return res;
        }
        return respond(
          { content: "No problem — what time works for you?", parsedIntent: draft, pendingAction: { ...draft, time: undefined } },
          message,
        );
      }

      // Fallback: regex didn't match — ask OpenAI to classify as yes/no/cancel
      const verdict = await classifyConfirmation(message);
      if (verdict === "yes") {
        const { awaitingConflictAck, ...rest } = pending;
        const res = await handleCreateEvent(
          { ...rest, awaitingConfirmation: false },
          { skipConflictCheck: awaitingConflictAck === true },
        );
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }
      if (verdict === "cancel") {
        return respond(
          { content: "No worries — I've cancelled that.", parsedIntent, pendingAction: null },
          message,
        );
      }
      // verdict is "no" or "unknown" — ask for a different time
      return respond(
        {
          content: "No problem — what time works for you?",
          parsedIntent: { ...pending, awaitingConfirmation: false, awaitingConflictAck: false },
          pendingAction: {
            ...pending,
            awaitingConfirmation: false,
            awaitingConflictAck: false,
            time: undefined,
          },
        },
        message,
      );
    }

    // ── Pending create_event draft exists ────────────────────────────
    if (pending?.intent === "create_event") {
      if (CONFIRM_CANCEL.test(message) || /^\s*(cancel|never\s*mind|forget\s*it|nvm|skip)\b/i.test(message)) {
        return respond(
          { content: "No worries — I've cancelled that.", parsedIntent, pendingAction: null },
          message,
        );
      }

      // Short message that fills missing slots (e.g. "tomorrow", "12pm", "tomorrow at 3pm")
      const isShortFill = message.trim().split(/\s+/).length <= 4;
      const fillsDate = !pending.date && parsedIntent.date;
      const fillsTime = !pending.time && parsedIntent.time;

      if (isShortFill && (fillsDate || fillsTime)) {
        const filled = {
          ...pending,
          date: parsedIntent.date ?? pending.date,
          time: parsedIntent.time ?? pending.time,
          awaitingConfirmation: false,
        };
        const res = await handleCreateEvent(filled);
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }

      if (shouldResumePendingCreateDraft(message, parsedIntent)) {
        const merged = mergeSlotsOverride(pending, parsedIntent);
        merged.intent = "create_event";
        const res = await handleCreateEvent(merged);
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }

      if (isContinuation(message, parsedIntent)) {
        const merged = mergeSlots(pending, parsedIntent);
        merged.intent = "create_event";
        const res = await handleCreateEvent(merged);
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }

      // Fallback: short message didn't match any slot-fill — ask OpenAI to interpret
      if (isShortFill && (!pending.date || !pending.time)) {
        const extracted = await extractSlotsFallback(message, pending);
        if (extracted) {
          const filled = {
            ...pending,
            date: extracted.date ?? pending.date,
            time: extracted.time ?? pending.time,
            duration_minutes: extracted.duration_minutes ?? pending.duration_minutes,
            awaitingConfirmation: false,
          };
          const res = await handleCreateEvent(filled);
          logConversation(message, JSON.parse(await res.clone().text()).content);
          return res;
        }
      }
    }

    // ── check_availability ──────────────────────────────────────────
    if (parsedIntent.intent === "check_availability") {
      const res = await handleCheckAvailability(parsedIntent, pending ?? undefined);
      logConversation(message, JSON.parse(await res.clone().text()).content);
      return res;
    }

    // ── save_preference ─────────────────────────────────────────────
    if (parsedIntent.intent === "save_preference") {
      if (parsedIntent.preference_key && parsedIntent.preference_value) {
        const normalizedKey = normalizePreferenceKey(parsedIntent.preference_key);
        const label = normalizedKey.replace(/_/g, " ");
        try {
          const result = await savePreference(USER_ID, normalizedKey, parsedIntent.preference_value);

          const content =
            result.status === "unchanged"
              ? `I already have that saved — your ${label} is "${result.value}".`
              : result.status === "updated"
                ? `Updated — I'll use "${result.value}" as your ${label} instead of "${result.previousValue}".`
                : `Saved — I'll remember that your ${label} is "${result.value}".`;

          return respond(
            { content, parsedIntent, pendingAction: pending ?? null },
            message,
          );
        } catch {
          return respond(
            { content: "Sorry, I couldn't save that preference right now.", parsedIntent, pendingAction: pending ?? null },
            message,
          );
        }
      }

      if (!parsedIntent.preference_key) {
        return respond({ content: "What preference would you like me to remember?", parsedIntent, pendingAction: pending ?? null }, message);
      }
      return respond({ content: "What should the value be?", parsedIntent, pendingAction: pending ?? null }, message);
    }

    // ── get_preferences ─────────────────────────────────────────────
    if (parsedIntent.intent === "get_preferences") {
      try {
        const prefs = await getPreferences(USER_ID);
        if (prefs.length === 0) {
          return respond({ content: "You don't have any saved preferences yet.", parsedIntent, pendingAction: pending ?? null }, message);
        }
        const list = prefs.map((p) => `• ${p.key.replace(/_/g, " ")}: ${p.value}`).join("\n");
        return respond({ content: `Here are your preferences:\n${list}`, parsedIntent, pendingAction: pending ?? null }, message);
      } catch {
        return respond({ content: "Sorry, I couldn't fetch your preferences right now.", parsedIntent, pendingAction: pending ?? null }, message);
      }
    }

    // ── list_events ────────────────────────────────────────────────
    if (parsedIntent.intent === "list_events") {
      const label = parsedIntent.date ?? "tomorrow";
      try {
        const { events } = await listEventsForDateParam(parsedIntent.date);

        const content = (() => {
          if (events.length === 0) return `Your calendar is free ${label}.`;

          const lines = events.map((e) => {
            const hm = extractHM(e.start);
            if (!hm) return `• ${e.summary}`;
            const t = formatTimeForDisplay(hm.h, hm.m);
            return `• ${t} — ${e.summary}`;
          });

          const header = `You have ${events.length} event${events.length === 1 ? "" : "s"} ${label}:`;
          return `${header}\n${lines.join("\n")}`;
        })();

        return respond({ content, parsedIntent, pendingAction: pending ?? null }, message);
      } catch {
        return respond({ content: `Sorry, I couldn't look up events for "${label}". Try today or tomorrow.`, parsedIntent, pendingAction: pending ?? null }, message);
      }
    }

    // ── delete_event ──────────────────────────────────────────────
    if (parsedIntent.intent === "delete_event") {
      const res = await handleDeleteEvent(parsedIntent, body.lastEvent ?? null, message);
      logConversation(message, JSON.parse(await res.clone().text()).content);
      return res;
    }

    // ── update_event ──────────────────────────────────────────────
    if (parsedIntent.intent === "update_event") {
      const res = await handleUpdateEvent(parsedIntent, body.lastEvent ?? null, message);
      logConversation(message, JSON.parse(await res.clone().text()).content);
      return res;
    }

    // ── create_event (fresh, no pending) ────────────────────────────
    if (parsedIntent.intent === "create_event") {
      const action: PendingAction = {
        intent: "create_event",
        title: parsedIntent.title,
        date: parsedIntent.date,
        time: parsedIntent.time,
        duration_minutes: parsedIntent.duration_minutes,
      };
      const res = await handleCreateEvent(action);
      logConversation(message, JSON.parse(await res.clone().text()).content);
      return res;
    }

    // ── everything else ────────────────────────────────────────────
    const staticReply = (() => {
      switch (parsedIntent.intent) {
        case "create_reminder":
          return "Sure — you want to set a reminder. When should it trigger and what's the reminder for?";
        case "check_conflict":
          return "Alright — I'll check for scheduling conflicts. What time window should I compare?";
        default:
          return null;
      }
    })();

    if (staticReply) {
      return respond({ content: staticReply, parsedIntent, pendingAction: pending ?? null }, message);
    }

    // ── general_chat: use OpenAI for a natural reply ──────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey });
        const res = await client.responses.create({
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          instructions:
            "You are Sarjy, a friendly and concise voice-first calendar assistant. You can schedule events, list upcoming events, check availability, detect conflicts, and remember user preferences. Keep replies short (1-3 sentences), natural, and helpful. If the user greets you or asks what you can do, briefly introduce your capabilities.",
          input: [
            ...(Array.isArray(body.messages)
              ? body.messages.slice(-6).map((m) => ({
                  role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                  content: String(m.content),
                }))
              : []),
            { role: "user" as const, content: message },
          ],
        });

        const outputText =
          typeof (res as { output_text?: unknown }).output_text === "string"
            ? (res as { output_text: string }).output_text
            : "";

        if (outputText.trim()) {
          return respond({ content: outputText.trim(), parsedIntent, pendingAction: pending ?? null }, message);
        }
      } catch {
        // fall through to fallback
      }
    }

    return respond({ content: "Hey — I'm Sarjy, your calendar assistant. I can schedule events, check your availability, list what's on your calendar, and remember your preferences. What can I help with?", parsedIntent, pendingAction: pending ?? null }, message);
  } catch {
    return json(
      {
        content:
          "Sorry, something went wrong while preparing your reply. Please try again.",
        pendingAction: null,
      },
      500
    );
  }
}
