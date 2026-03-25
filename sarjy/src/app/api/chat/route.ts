import { parseIntent, type ParsedIntent } from "@/lib/intentParser";
import { listEventsForDateParam } from "@/app/api/calendar/events/route";
import {
  createCalendarEvent,
  resolveTime,
  formatTimeForDisplay,
} from "@/app/api/calendar/create/route";
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
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Slot-filling helpers ────────────────────────────────────────────

const SIDE_INTENT_TYPES = new Set([
  "check_availability",
  "list_events",
  "create_reminder",
  "check_conflict",
  "save_preference",
  "get_preferences",
]);

function isContinuation(message: string, parsedIntent: ParsedIntent): boolean {
  if (SIDE_INTENT_TYPES.has(parsedIntent.intent)) return false;
  if (parsedIntent.intent === "create_event") return true;
  if (message.trim().split(/\s+/).length <= 4) return true;
  return false;
}

const CONFIRM_YES = /^\s*(yes|yeah|yep|sure|ok|okay|yea|do it|book it|go ahead|confirm|let'?s do it)\s*[.!]?\s*$/i;
const CONFIRM_NO = /^\s*(no|nah|nope|not really|don'?t|cancel|never\s*mind|different time)\s*[.!]?\s*$/i;

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

// ── Preference-aware time helpers ────────────────────────────────────

/** Parse preference values like "after 2 PM", "2 PM", "14:00" into hours/minutes. */
function parsePreferredTime(pref: string): { hours: number; minutes: number } | null {
  const cleaned = pref.replace(/^(after|before|around|at)\s+/i, "").trim();
  try {
    return resolveTime(cleaned);
  } catch {
    return null;
  }
}

type CalEvent = { id: string; summary: string; start: string; end: string };

function isSlotBusy(
  events: CalEvent[],
  hours: number,
  minutes: number,
  durationMinutes: number,
): boolean {
  const slotStart = hours * 60 + minutes;
  const slotEnd = slotStart + durationMinutes;

  return events.some((e) => {
    try {
      const s = new Date(e.start);
      const eEnd = new Date(e.end);
      const evStart = s.getHours() * 60 + s.getMinutes();
      const evEnd = eEnd.getHours() * 60 + eEnd.getMinutes();
      return slotStart < evEnd && slotEnd > evStart;
    } catch {
      return false;
    }
  });
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

async function handleCreateEvent(action: PendingAction) {
  const duration = action.duration_minutes ?? 30;

  // If title + date are present but time is missing, try preference
  if (action.title && action.date && !action.time) {
    try {
      const allPrefs = await getPreferences(USER_ID);
      const timePref = allPrefs.find(
        (p) => /meet|time|start|schedul/i.test(p.key),
      );
      const prefValue = timePref?.value ?? null;
      if (prefValue) {
        const parsed = parsePreferredTime(prefValue);
        if (parsed) {
          const { events } = await listEventsForDateParam(action.date);
          const prefDisplay = formatTimeForDisplay(parsed.hours, parsed.minutes);
          const timeStr = `${parsed.hours > 12 ? parsed.hours - 12 : parsed.hours}${parsed.minutes ? `:${String(parsed.minutes).padStart(2, "0")}` : ""} ${parsed.hours >= 12 ? "PM" : "AM"}`;

          if (!isSlotBusy(events, parsed.hours, parsed.minutes, duration)) {
            const draft = { ...action, time: timeStr, awaitingConfirmation: true };
            return json({
              content: `You prefer meetings ${prefValue.toLowerCase()}. Want me to schedule "${action.title}" for ${action.date} at ${prefDisplay}?`,
              parsedIntent: draft,
              pendingAction: draft,
            });
          }

          const next = findNextFreeSlot(events, parsed.hours, parsed.minutes, duration);
          if (next) {
            const nextDisplay = formatTimeForDisplay(next.hours, next.minutes);
            const nextTimeStr = `${next.hours > 12 ? next.hours - 12 : next.hours}${next.minutes ? `:${String(next.minutes).padStart(2, "0")}` : ""} ${next.hours >= 12 ? "PM" : "AM"}`;
            const draft = { ...action, time: nextTimeStr, awaitingConfirmation: true };
            return json({
              content: `You prefer meetings ${prefValue.toLowerCase()}, but ${prefDisplay} is busy. The next free slot is ${nextDisplay}. Want me to book it then?`,
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

  try {
    const event = await createCalendarEvent({
      title: action.title,
      date: action.date,
      time: action.time,
      duration_minutes: action.duration_minutes,
    });

    const startTime = (() => {
      try {
        const { hours, minutes } = resolveTime(action.time!);
        return formatTimeForDisplay(hours, minutes);
      } catch {
        return action.time;
      }
    })();

    const content = `Done — "${event.summary}" is on your calendar for ${action.date} at ${startTime} (${duration} min).`;

    return json({ content, parsedIntent: action, pendingAction: null });
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
      return json({
        content: `You have ${events.length} event${events.length === 1 ? "" : "s"} ${date}. You might have a conflict.`,
        parsedIntent,
        pendingAction: updatedPending,
      });
    }

    const { hours: qH, minutes: qM } = resolveTime(timeStr);
    const queryMinutes = qH * 60 + qM;

    const hasOverlap = events.some((e) => {
      try {
        const s = new Date(e.start);
        const eEnd = new Date(e.end);
        const startMin = s.getHours() * 60 + s.getMinutes();
        const endMin = eEnd.getHours() * 60 + eEnd.getMinutes();
        return queryMinutes >= startMin && queryMinutes < endMin;
      } catch {
        return false;
      }
    });

    const displayTime = formatTimeForDisplay(qH, qM);

    if (hasOverlap) {
      return json({
        content: `You're busy at ${displayTime} ${date} — there's already something on your calendar.`,
        parsedIntent,
        pendingAction: updatedPending,
      });
    }

    return json({
      content: `You're free at ${displayTime} ${date}.`,
      parsedIntent,
      pendingAction: updatedPending,
    });
  } catch {
    return json({
      content: `Sorry, I could only check today or tomorrow for now. Try "am I free tomorrow at 10 AM?"`,
      parsedIntent,
      pendingAction: updatedPending,
    });
  }
}

// ── Conversation logging (fire-and-forget) ──────────────────────────

function logConversation(userMsg: string, assistantMsg: string) {
  saveConversationMessage(USER_ID, "user", userMsg).catch(() => {});
  saveConversationMessage(USER_ID, "assistant", assistantMsg).catch(() => {});
}

function respond(
  data: { content: string; parsedIntent?: unknown; pendingAction?: unknown },
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
      pendingAction?: PendingAction;
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
        const res = await handleCreateEvent({ ...pending, awaitingConfirmation: false });
        logConversation(message, JSON.parse(await res.clone().text()).content);
        return res;
      }

      if (CONFIRM_NO.test(message) || parsedIntent.time) {
        const draft: PendingAction = {
          ...pending,
          awaitingConfirmation: false,
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
    }

    // ── Pending create_event draft exists ────────────────────────────
    if (pending?.intent === "create_event") {
      // Short message that fills a missing time slot (e.g. "12pm", "3 pm")
      if (!pending.time && parsedIntent.time && message.trim().split(/\s+/).length <= 3) {
        const filled = { ...pending, time: parsedIntent.time, awaitingConfirmation: false };
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
        const label = parsedIntent.preference_key.replace(/_/g, " ");
        try {
          const result = await savePreference(USER_ID, parsedIntent.preference_key, parsedIntent.preference_value);

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

    // ── list_events (today/tomorrow) ────────────────────────────────
    if (
      parsedIntent.intent === "list_events" &&
      (!parsedIntent.date ||
        parsedIntent.date.trim().toLowerCase() === "tomorrow" ||
        parsedIntent.date.trim().toLowerCase() === "today")
    ) {
      const { events } = await listEventsForDateParam(parsedIntent.date);
      const label = parsedIntent.date ?? "tomorrow";

      const content = (() => {
        if (events.length === 0) return `Your calendar is free ${label}.`;

        const formatTime = (v: string) => {
          if (!v) return "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
          try {
            return new Date(v).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
          } catch {
            return "";
          }
        };

        const top = events
          .slice(0, 5)
          .map((e) => {
            const t = formatTime(e.start);
            return t ? `${t} — ${e.summary}` : e.summary;
          })
          .join(", ");

        const more = events.length > 5 ? ` (+${events.length - 5} more)` : "";
        return `You have ${events.length} event${events.length === 1 ? "" : "s"} ${label}: ${top}${more}`;
      })();

      return respond({ content, parsedIntent, pendingAction: pending ?? null }, message);
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

    // ── everything else (static replies for now) ────────────────────
    const content = (() => {
      switch (parsedIntent.intent) {
        case "update_event":
          return "Understood — you want to update an event. What should change (what event and what details)?";
        case "list_events":
          if (parsedIntent.date) {
            return `Got it — looking up your events for ${parsedIntent.date}.`;
          }
          return "Sure — what date should I check (today, tomorrow, or a specific day)?";
        case "create_reminder":
          return "Sure — you want to set a reminder. When should it trigger and what's the reminder for?";
        case "check_conflict":
          return "Alright — I'll check for scheduling conflicts. What time window should I compare?";
        case "general_chat":
        default:
          return "Thanks — I'm listening. What would you like to do?";
      }
    })();

    return respond({ content, parsedIntent, pendingAction: pending ?? null }, message);
  } catch {
    return json(
      {
        content:
          "Sorry, something went wrong while preparing your reply. Please try again.",
      },
      500
    );
  }
}
