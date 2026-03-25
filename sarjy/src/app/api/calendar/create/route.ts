import { NextResponse } from "next/server";
import { getAuthenticatedGoogleCalendar } from "@/lib/googleCalendar";

type CreateEventBody = {
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
};

type CreatedEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function resolveDate(dateInput: string): string {
  const lower = dateInput.trim().toLowerCase();

  if (lower === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  if (lower === "today") {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return lower;

  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Could not parse date: "${dateInput}"`);
  }
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

export function resolveTime(timeInput: string): { hours: number; minutes: number } {
  const trimmed = timeInput.trim().toLowerCase();

  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = Number(match12[1]);
    const minutes = Number(match12[2] ?? "0");
    const period = match12[3];
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: Number(match24[1]), minutes: Number(match24[2]) };
  }

  throw new Error(`Could not parse time: "${timeInput}"`);
}

export function formatTimeForDisplay(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${h}:${pad2(minutes)} ${period}`;
}

function buildDateTimeStrings(
  dateStr: string,
  hours: number,
  minutes: number,
  durationMinutes: number
): { startDT: string; endDT: string } {
  const startDT = `${dateStr}T${pad2(hours)}:${pad2(minutes)}:00`;

  let endH = hours;
  let endM = minutes + durationMinutes;
  endH += Math.floor(endM / 60);
  endM = endM % 60;
  if (endH >= 24) {
    endH = 23;
    endM = 59;
  }
  const endDT = `${dateStr}T${pad2(endH)}:${pad2(endM)}:00`;

  return { startDT, endDT };
}

export async function createCalendarEvent(body: CreateEventBody): Promise<CreatedEvent> {
  const { title, date, time, duration_minutes } = body;

  if (!title) throw new Error("Missing event title.");
  if (!date) throw new Error("Missing event date.");
  if (!time) throw new Error("Missing event time.");

  const dateStr = resolveDate(date);
  const { hours, minutes } = resolveTime(time);
  const duration = duration_minutes && duration_minutes > 0 ? duration_minutes : 30;
  const { startDT, endDT } = buildDateTimeStrings(dateStr, hours, minutes, duration);
  const timeZone = process.env.TIMEZONE || "Asia/Riyadh";

  const calendar = getAuthenticatedGoogleCalendar();

  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    requestBody: {
      summary: title,
      start: { dateTime: startDT, timeZone },
      end: { dateTime: endDT, timeZone },
    },
  });

  const event = res.data;

  return {
    id: event.id ?? "",
    summary: event.summary ?? title,
    start: event.start?.dateTime ?? startDT,
    end: event.end?.dateTime ?? endDT,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateEventBody;
    const event = await createCalendarEvent(body);

    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create event.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
