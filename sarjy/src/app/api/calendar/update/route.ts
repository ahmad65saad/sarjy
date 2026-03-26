import { NextResponse } from "next/server";
import { getAuthenticatedGoogleCalendar } from "@/lib/googleCalendar";
import { resolveDate, resolveTime, pad2 } from "@/app/api/calendar/create/route";

export type UpdateEventBody = {
  eventId: string;
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
};

export type UpdatedEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
};

export async function updateCalendarEvent(body: UpdateEventBody): Promise<UpdatedEvent> {
  const { eventId, title, date, time, duration_minutes } = body;
  if (!eventId) throw new Error("Missing event ID.");

  const calendar = getAuthenticatedGoogleCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timeZone = process.env.TIMEZONE || "Asia/Riyadh";

  const existing = await calendar.events.get({ calendarId, eventId });
  const ev = existing.data;

  const curStart = ev.start?.dateTime;
  const curEnd = ev.end?.dateTime;
  if (!curStart || !curEnd) throw new Error("Cannot update all-day events.");

  const dateMatch = curStart.match(/^(\d{4}-\d{2}-\d{2})/);
  const timeMatch = curStart.match(/T(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) throw new Error("Cannot parse existing event.");

  let newDateStr = dateMatch[1];
  let newH = Number(timeMatch[1]);
  let newM = Number(timeMatch[2]);

  const curMs = new Date(curEnd).getTime() - new Date(curStart).getTime();
  let durMin = Math.round(curMs / 60000);
  if (durMin <= 0) durMin = 30;

  if (date) newDateStr = await resolveDate(date);
  if (time) {
    const t = await resolveTime(time);
    newH = t.hours;
    newM = t.minutes;
  }
  if (duration_minutes && duration_minutes > 0) durMin = duration_minutes;

  const newStartDT = `${newDateStr}T${pad2(newH)}:${pad2(newM)}:00`;

  let endH = newH;
  let endM = newM + durMin;
  endH += Math.floor(endM / 60);
  endM = endM % 60;

  let endDateStr = newDateStr;
  if (endH >= 24) {
    const [y, mo, d] = newDateStr.split("-").map(Number);
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    endDateStr = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
    endH -= 24;
  }
  const newEndDT = `${endDateStr}T${pad2(endH)}:${pad2(endM)}:00`;

  const requestBody: Record<string, unknown> = {
    start: { dateTime: newStartDT, timeZone },
    end: { dateTime: newEndDT, timeZone },
  };
  if (title) requestBody.summary = title;

  const res = await calendar.events.patch({ calendarId, eventId, requestBody });
  const updated = res.data;

  return {
    id: updated.id ?? eventId,
    summary: updated.summary ?? ev.summary ?? "",
    start: updated.start?.dateTime ?? newStartDT,
    end: updated.end?.dateTime ?? newEndDT,
  };
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!eventId) throw new Error("Missing event ID.");

  const calendar = getAuthenticatedGoogleCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  await calendar.events.delete({ calendarId, eventId });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as UpdateEventBody;
    const event = await updateCalendarEvent(body);
    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update event.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
