import { NextResponse } from "next/server";
import { oauth2Client } from "@/lib/googleCalendar";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Missing `code` query parameter." },
        { status: 400 }
      );
    }

    const client = oauth2Client();
    const tokenResponse = await client.getToken(code);
    const tokens = tokenResponse.tokens;

    // Intentionally logged for hackathon/internship prototyping.
    // Copy `refresh_token` from logs into `.env.local` as `GOOGLE_REFRESH_TOKEN`.
    console.log("Google OAuth tokens:", tokens);

    if (tokens?.refresh_token) {
      console.log(
        "Copy this into `.env.local` as `GOOGLE_REFRESH_TOKEN`:\n",
        tokens.refresh_token
      );
    } else {
      console.log(
        "No `refresh_token` returned. If this happens, try again after revoking the app's access."
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          "Google OAuth successful. Check server logs for tokens/refresh_token.",
        hasRefreshToken: Boolean(tokens?.refresh_token),
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown OAuth callback error.";
    console.error("Google OAuth callback failed:", message);

    return NextResponse.json(
      { error: "OAuth callback failed. Please try again." },
      { status: 500 }
    );
  }
}

