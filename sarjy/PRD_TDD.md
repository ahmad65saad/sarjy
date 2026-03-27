# Sarjy — PRD & technical design

Brief product definition and how the current implementation matches it. Scope: demo / internship-quality, not full SaaS.

---

## 1. Product requirements (PRD)

### Problem

Scheduling via Google Calendar is accurate but fiddly on mobile and while multitasking. People want to **say or type** what they need and have the assistant **ground actions in the real calendar**.

### Product vision

**Sarjy** is a conversational calendar front-end: voice-first, text fallback, backed by Google Calendar and a small memory layer for preferences.

### Target user (demo)

A single user (or evaluator) who has connected **one** Google account and wants quick create/list/availability flows without opening the Calendar app.

### Goals

| Goal | Status |
|------|--------|
| Accept voice + text | Done (Web Speech API + composer) |
| Natural replies | Done (TTS + short OpenAI copy for `general_chat`) |
| Create events on real calendar | Done |
| List events for a day | Done |
| Availability / busy check with overlap | Done (`check_availability` + create-time conflict) |
| Remember preferences | Done (Supabase `preferences`) |
| Update / delete events | Done (intent + API; delete/update often tied to last event or search) |
| Persist chat rows | Done (Supabase `conversation_history`; not full context replay) |

### Non-goals (explicit)

- Multi-user auth and per-user OAuth tokens in the database  
- Google Tasks / Reminders as real objects  
- Production security review, rate limits, or abuse prevention beyond basics  
- i18n, telephony, video avatar  

### Core user flows

1. **Create** — User states meeting + rough time/date → parser extracts slots → optional preference fill → optional conflict warning → confirm → `events.insert`.  
2. **List** — User asks what’s on (today/tomorrow/etc.) → `events.list` in day window.  
3. **Availability** — User asks if free at time → same day’s events → interval overlap → free/busy message (and optional structured `availability` payload).  
4. **Preference** — User asks to remember something (e.g. default duration, preferred start time) → upsert `preferences` → confirmation in chat.  
5. **Update / delete** — Natural language → resolve event (e.g. last created, title/date match) → patch or delete via API.

### Success criteria (demo)

- Live demo: voice or type → visible change in Google Calendar.  
- Explain stack: OpenAI + Google + Supabase + Next.js in under two minutes.  
- Honest limitations: single account, demo user id, OAuth via env refresh token.

---

## 2. Technical design (TDD)

### Architecture

```
Browser (page.tsx)
  → POST /api/chat  { message, messages[], pendingAction, lastEvent }
        → parseIntent (heuristics + OpenAI JSON)
        → branches: calendar helpers, memory, OpenAI chat
  → Google Calendar API (server-only, refresh token in env)
  → Supabase (server-only secret key)
```

- **No** client-side Google or Supabase secrets.  
- **State machine light**: `pendingAction` carries in-progress `create_event` (slots, `awaitingConfirmation`, `awaitingConflictAck` after conflict prompt).  
- **`lastEvent`** helps “that meeting” follow-ups for update/delete.

### Key modules

| Module | Responsibility |
|--------|------------------|
| `api/chat/route.ts` | Intent routing, slot merge, confirmations, conflict override, preference handlers, `general_chat` OpenAI thread from last N client messages |
| `lib/intentParser.ts` | Fast heuristics; OpenAI for structured `ParsedIntent` |
| `api/calendar/create/route.ts` | `resolveDate` / `resolveTime`, `createCalendarEvent` |
| `api/calendar/events/route.ts` | Day range query + `TZ_OFFSET` for `timeMin`/`timeMax` |
| `api/calendar/update/route.ts` | Patch + delete; `TIMEZONE` for `dateTime` |
| `lib/googleCalendar.ts` | OAuth URL generation; authenticated client from `GOOGLE_REFRESH_TOKEN` |
| `lib/memory.ts` | `preferences` CRUD + `conversation_history` insert |
| `lib/parseAssistantContent.ts` | Regex-based UI blocks from assistant plain text |
| `hooks/useSpeech*` | Mic + TTS; pause mic while speaking |

### Data model (Supabase)

- **preferences** — key/value per `user_id` (app uses fixed `demo-user`).  
- **conversation_history** — append-only log of user/assistant strings.

### External APIs

- **OpenAI** — Responses API for intent JSON, slot extraction, confirmation classification, and general replies.  
- **Google Calendar API v3** — list, insert, patch, delete.  
- **Supabase** — Postgres via JS client.

### Environment coupling

See `README.md`. **Critical path**: valid `GOOGLE_REFRESH_TOKEN` + `OPENAI_API_KEY` + Supabase URL/key for full behavior.

### Testing strategy (recommended, not all implemented)

| Area | Approach |
|------|----------|
| Intent parser | Unit tests: heuristic examples + mocked OpenAI |
| Date/time resolve | Unit tests: today/tomorrow, edge TZ |
| Chat orchestration | Integration tests: POST body + mocked calendar + memory |
| UI | Manual: mic permission, HTTPS, happy paths |
| OAuth | Manual: one full code→refresh flow per environment |

### Risks & mitigations (demo)

| Risk | Mitigation |
|------|------------|
| Refresh token leaked | Never commit `.env.local`; rotate in Google |
| OpenAI cost | Cap history length; default small model |
| Speech API variance | Document “Chrome + HTTPS”; text always works |
| Wrong timezone | Set `TIMEZONE` / `TZ_OFFSET` to match the calendar user |

