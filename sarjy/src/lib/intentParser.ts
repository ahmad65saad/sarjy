import OpenAI from "openai";

type Intent =
  | "general_chat"
  | "save_preference"
  | "get_preferences"
  | "create_event"
  | "list_events"
  | "update_event"
  | "create_reminder"
  | "check_conflict"
  | "check_availability";

export type ParsedIntent = {
  intent: Intent;
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
  preference_key?: string;
  preference_value?: string;
  original_message: string;
};

const INTENTS: Intent[] = [
  "general_chat",
  "save_preference",
  "get_preferences",
  "create_event",
  "list_events",
  "update_event",
  "create_reminder",
  "check_conflict",
  "check_availability",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDurationMinutes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim().toLowerCase();
  // Accept raw numbers ("30") as well as phrases ("30 minutes").
  const m = trimmed.match(/(\d+)\s*(minutes?|mins?)\b/);
  if (m) return Number(m[1]);

  const hours = trimmed.match(/(\d+)\s*(hours?|hrs?)\b/);
  if (hours) return Number(hours[1]) * 60;

  const raw = trimmed.match(/^(\d+)$/);
  if (raw) return Number(raw[1]);

  return undefined;
}

function extractJsonText(outputText: string): string {
  const trimmed = outputText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // Best-effort: extract the first {...} block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parseParsedIntent(
  data: unknown,
  original_message: string
): ParsedIntent {
  if (!isObject(data)) {
    return { intent: "general_chat", original_message };
  }

  const intentRaw = data.intent;
  const intent = typeof intentRaw === "string" ? intentRaw : "";
  const normalized = INTENTS.includes(intent as Intent)
    ? (intent as Intent)
    : "general_chat";

  const result: ParsedIntent = {
    intent: normalized,
    original_message,
  };

  const maybeString = (key: keyof ParsedIntent): void => {
    const v = data[key as string];
    if (typeof v === "string" && v.trim()) {
      (result[key] as unknown) = v;
    }
  };

  const maybeNumber = (key: keyof ParsedIntent): void => {
    const v = data[key as string];
    const parsed = key === "duration_minutes" ? parseDurationMinutes(v) : undefined;
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      (result[key] as unknown) = parsed;
    }
  };

  // Optional fields
  maybeString("title");
  maybeString("date");
  maybeString("time");
  maybeString("preference_key");
  maybeString("preference_value");
  maybeNumber("duration_minutes");

  // Reject time values that have no digits (e.g. bare "am" or "pm").
  if (result.time && !/\d/.test(result.time)) {
    delete result.time;
  }

  return result;
}

function capitalizeWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

// "10am" → "10 AM", "4:30pm" → "4:30 PM", "10 am" → "10 AM", "16:00" → "16:00"
function extractTimePhrase(message: string): string | undefined {
  // 12-hour: "10am", "10 am", "4:30pm", "4:30 pm"
  const m12 = message.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/i);
  if (m12) {
    const hour = m12[1];
    const mins = m12[2] ?? "";
    const period = m12[3].toUpperCase();
    return `${hour}${mins} ${period}`;
  }

  // 24-hour: "16:00"
  const m24 = message.match(/\b(\d{1,2}:\d{2})\b/);
  if (m24) return m24[1];

  return undefined;
}

function extractDurationMinutesHeuristic(message: string): number | undefined {
  const lower = message.toLowerCase();
  const minutes = lower.match(/(\d+)\s*(minutes?|mins?)\b/);
  if (minutes) return Number(minutes[1]);

  const hours = lower.match(/(\d+)\s*(hours?|hrs?)\b/);
  if (hours) return Number(hours[1]) * 60;

  return undefined;
}

function extractDateHeuristic(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (/\btomorrow\b/i.test(lower)) return "tomorrow";
  if (/\btoday\b/i.test(lower)) return "today";

  const weekday = lower.match(
    /\b(next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|today|tomorrow))\b/i
  );
  if (weekday) return weekday[1].trim();

  // Catch simple "on <token>" patterns (keep it concise).
  const on = message.match(/\bon\s+([A-Za-z0-9,\s-]{1,30})/i);
  if (on) return on[1].trim();

  return undefined;
}

function extractTitleHeuristic(message: string): string | undefined {
  const m = message.match(
    /\b(meeting|call|sync|catch[-\s]?up)\s+with\s+(.+?)(?=\b(today|tomorrow|next|on|at|for|duration|minutes?\b|\d{1,2}\s*(am|pm))|$)/i
  );
  if (!m) return undefined;

  const kind = m[1].toLowerCase();
  const rawName = (m[2] ?? "").trim().replace(/\s+/g, " ");
  if (!rawName) return undefined;

  const name = capitalizeWords(rawName.replace(/[,!.?]$/g, ""));

  if (kind === "meeting") return `Meeting with ${name}`;
  if (kind === "call") return `Call with ${name}`;
  if (kind === "sync") return `Sync with ${name}`;
  return `Catch-up with ${name}`;
}

function heuristicParse(message: string): ParsedIntent {
  const original_message = message;
  const lower = message.toLowerCase();

  const time = extractTimePhrase(message);
  const date = extractDateHeuristic(message);
  const duration_minutes = extractDurationMinutesHeuristic(message);
  const title = extractTitleHeuristic(message);

  const hasAvailability =
    /\b(am i free|am i available|am i busy|do i have anything|is my calendar free|anything scheduled)\b/i.test(lower);
  const hasPreference =
    /\b(remember|i\s*prefer|prefer|set\s*a\s*preference|preference)\b/i.test(lower);
  const hasGetPreferences = /\b(get|show|what are)\b.*\bpreferences?\b/i.test(lower);
  const hasList = /\b(what do i have|what's on|show (me )?events|list events|my events)\b/i.test(lower);
  const hasCreate =
    /\b(schedule|set up|book|create|make)\b.*\b(meeting|call|event)\b/i.test(lower);
  const hasUpdate = /\b(update|change|reschedule|modify)\b.*\b(event|meeting)\b/i.test(lower);
  const hasReminder = /\b(remind me|set a reminder|create a reminder)\b/i.test(lower);
  const hasConflict = /\b(conflict|double[-\s]?book|overlap)\b/i.test(lower);

  // Special-case the explicit preference example you provided.
  if (hasPreference) {
    const afterTime = lower.match(/\b(after)\s+(\d{1,2}(:\d{2})?\s*(am|pm))\b/i);
    if (afterTime) {
      const timePhrase = afterTime[2];
      return {
        intent: "save_preference",
        preference_key: "preferred_meeting_start_time",
        preference_value: `after ${timePhrase.toUpperCase()}`,
        original_message,
      };
    }

    const beforeTime = lower.match(/\b(before)\s+(\d{1,2}(:\d{2})?\s*(am|pm))\b/i);
    if (beforeTime) {
      const timePhrase = beforeTime[2];
      return {
        intent: "save_preference",
        preference_key: "preferred_meeting_start_time",
        preference_value: `before ${timePhrase.toUpperCase()}`,
        original_message,
      };
    }

    // Generic preference fallback: keep key/value as much as we can.
    return {
      intent: hasGetPreferences ? "get_preferences" : "save_preference",
      preference_value: time ? `around ${time}` : undefined,
      original_message,
    };
  }

  if (hasGetPreferences) {
    return { intent: "get_preferences", date, time, duration_minutes, original_message };
  }

  if (hasAvailability) {
    return { intent: "check_availability", date, time, original_message };
  }

  if (hasList) {
    return { intent: "list_events", date, original_message };
  }

  if (hasCreate) {
    return {
      intent: "create_event",
      title,
      date,
      time,
      duration_minutes,
      original_message,
    };
  }

  if (hasUpdate) {
    return {
      intent: "update_event",
      title,
      date,
      time,
      duration_minutes,
      original_message,
    };
  }

  if (hasReminder) {
    return {
      intent: "create_reminder",
      date,
      time,
      duration_minutes,
      original_message,
    };
  }

  if (hasConflict) {
    return { intent: "check_conflict", date, time, original_message };
  }

  return { intent: "general_chat", title, date, time, duration_minutes, original_message };
}

function isValidTime(t: string | undefined): boolean {
  if (!t) return false;
  return /\d/.test(t);
}

function mergeParsedIntent(base: ParsedIntent, model: ParsedIntent): ParsedIntent {
  // Prefer model fields, but fall back to heuristic.
  // For time: only trust the model if it contains digits.
  const modelTimeValid = isValidTime(model.time);
  return {
    intent: model.intent ?? base.intent,
    original_message: base.original_message,
    title: model.title ?? base.title,
    date: model.date ?? base.date,
    time: modelTimeValid ? model.time : base.time,
    duration_minutes: model.duration_minutes ?? base.duration_minutes,
    preference_key: model.preference_key ?? base.preference_key,
    preference_value: model.preference_value ?? base.preference_value,
  };
}

export async function parseIntent(message: string): Promise<ParsedIntent> {
  const original_message = message;
  const userMessage = message.trim();
  if (!userMessage) {
    return { intent: "general_chat", original_message };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Best-effort local fallback so the prototype still works without OpenAI.
    return heuristicParse(userMessage);
  }

  const heuristic = heuristicParse(userMessage);

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      instructions:
        "You are an intent classification and information-extraction engine for Sarjy, a voice-first calendar assistant. Return ONLY valid JSON (no markdown, no extra text). Aggressively extract any fields the user mentions and copy them verbatim when possible. If you cannot find a field, omit it. IMPORTANT: For the time field, always return the FULL time expression including the hour, such as \"10 AM\", \"4:30 PM\", or \"16:00\". NEVER return only \"AM\" or \"PM\" without the hour number. Messages like \"am I free at 10am tomorrow\" or \"am I available tomorrow\" should be classified as check_availability, NOT create_event. The JSON MUST exactly match this shape: { intent: one of [general_chat, save_preference, get_preferences, create_event, list_events, update_event, create_reminder, check_conflict, check_availability], title?: string, date?: string, time?: string, duration_minutes?: number, preference_key?: string, preference_value?: string, original_message: string }.",
      input: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const outputText =
      typeof (response as { output_text?: unknown }).output_text === "string"
        ? (response as { output_text: string }).output_text
        : "";

    if (!outputText) {
      return heuristic;
    }

    const jsonText = extractJsonText(outputText);
    const data: unknown = JSON.parse(jsonText);

    const parsedFromModel = parseParsedIntent(data, original_message);
    return mergeParsedIntent(heuristic, parsedFromModel);
  } catch {
    return heuristic;
  }
}
