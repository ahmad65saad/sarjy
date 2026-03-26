import { google } from "googleapis";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

let _oauth2Client: OAuth2Client | null = null;

function getOAuth2Client(): OAuth2Client {
  if (_oauth2Client) return _oauth2Client;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId) throw new Error("Missing env var: GOOGLE_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing env var: GOOGLE_CLIENT_SECRET");
  if (!redirectUri) throw new Error("Missing env var: GOOGLE_REDIRECT_URI");

  _oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (refreshToken) {
    _oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return _oauth2Client;
}

export { getOAuth2Client as oauth2Client };

export function generateGoogleAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
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

  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  return google.calendar({ version: "v3", auth: client });
}
