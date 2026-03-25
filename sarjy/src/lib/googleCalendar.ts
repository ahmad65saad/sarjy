import { google } from "googleapis";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const oauth2Client = new google.auth.OAuth2(
  getRequiredEnv("GOOGLE_CLIENT_ID"),
  getRequiredEnv("GOOGLE_CLIENT_SECRET"),
  getRequiredEnv("GOOGLE_REDIRECT_URI")
);

// Wire the refresh token into the OAuth client so API calls can be made
// without re-authenticating the user.
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
if (refreshToken) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
}

export function generateGoogleAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    include_granted_scopes: true,
  });
}

export function getAuthenticatedGoogleCalendar() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "Missing GOOGLE_REFRESH_TOKEN. Complete OAuth, copy the refresh token into .env.local, then restart the app."
    );
  }

  // Ensure credentials are set even if the module was imported before .env
  // was loaded/changed.
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

