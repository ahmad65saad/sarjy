import { NextResponse } from "next/server";
import { generateGoogleAuthUrl } from "@/lib/googleCalendar";

export async function GET() {
  const url = generateGoogleAuthUrl();
  return NextResponse.redirect(url);
}

