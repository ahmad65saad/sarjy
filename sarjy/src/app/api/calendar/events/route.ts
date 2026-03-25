import { NextResponse } from "next/server";
import { getAuthenticatedGoogleCalendar } from "@/lib/googleCalendar";
import { resolveDate } from "@/app/api/calendar/create/route";

async function getLocalDayRange(dateParam?: string): Promise<{ timeMin: string; timeMax: string }> {
  const dateStr = await resolveDate(dateParam || "tomorrow");

  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export async function listEventsForDateParam(dateParam?: string): Promise<{
  events: Array<{ id: string; summary: string; start: string; end: string }>;
}> {
  const { timeMin, timeMax } = await getLocalDayRange(dateParam);
  const calendar = getAuthenticatedGoogleCalendar();

  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = res.data.items ?? [];

  return {
    events: items.map((e) => {
      const start = e.start?.dateTime ?? e.start?.date ?? "";
      const end = e.end?.dateTime ?? e.end?.date ?? "";

      return {
        id: e.id ?? "",
        summary: e.summary ?? "",
        start,
        end,
      };
    }),
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? undefined;
    const result = await listEventsForDateParam(date);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      { error: message || "Failed to list calendar events." },
      { status: 500 }
    );
  }
}

