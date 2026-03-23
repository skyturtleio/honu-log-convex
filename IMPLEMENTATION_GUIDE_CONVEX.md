# Honu Log — Design Reference

> **What this is:** Architecture decisions, data model, integration patterns, and gotchas for building Honu Log. This is a design reference for AI agents and future contributors — not a step-by-step script. Agents should read this for context, then implement as they see fit.

> **What this is NOT:** A tutorial or ordered checklist. Use beads (`bd`) for task tracking.

---

## Vision

A flight logbook PWA that replaces LogTen Pro. Offline-first, multi-device (iPhone, iPad, Mac via browser), web-only (no native apps). The user owns their data on self-hosted infrastructure.

**MVP scope:**

1. Log current airline flights (see [Flight Entry Flow](#flight-entry-flow) below)
2. Import ~4000 existing flights from LogTen Pro (tab-separated export)

**Post-MVP:**

- OCR/AI from ACARS screen photos or airline time cards to auto-generate flights
- Military pilot support (simplified entry: date + total time only)
- Multi-user support for side-gig launch
- Custom landing types (carrier day trap, carrier night trap, etc.)

---

## Tech Stack & Why

| Choice                                  | Why                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SvelteKit 5**                         | PWA-capable, SSR for landing page, client-only for app routes. Svelte 5 runes for reactivity.                                                                                                                                                       |
| **Convex (self-hosted)**                | Database + server + real-time sync in one. Self-hosted on Coolify = own your data. No cloud dependency.                                                                                                                                             |
| **Replicate** (`@trestleinc/replicate`) | **Solves offline writes** — the hardest problem. CRDT-based sync with local SQLite (OPFS) means reads and writes work instantly offline, then sync when connectivity returns. Without this, offline writes require hand-rolled conflict resolution. |
| **Logto (self-hosted)**                 | Auth via OIDC. Server-side only (`@logto/sveltekit`, NOT `@logto/browser`). Self-hosted on Coolify.                                                                                                                                                 |
| **Effect**                              | Functional error handling and service composition. See `effect-solutions` CLI for patterns.                                                                                                                                                         |
| **bun**                                 | Package manager. Never npm.                                                                                                                                                                                                                         |

---

## Architecture

### Data flow

```
┌─────────────────────────────────────────────────┐
│  Browser                                         │
│                                                  │
│  Svelte UI ←→ Replicate Collection (TanStack DB) │
│                    ↕                             │
│              Local SQLite (OPFS)                 │
│                    ↕                             │
│              Replicate Sync Engine               │
│                    ↕ (WebSocket)                 │
└────────────────────┼────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────┐
│  Convex (self-hosted)                            │
│                    ↕                             │
│  replicate mutation ←→ Convex Database           │
│                         (documents + CRDT state) │
│                                                  │
│  Auth: validates Logto JWTs via OIDC             │
└──────────────────────────────────────────────────┘
```

- **Write path:** UI → `collection.insert()` → instant SQLite write → debounced Convex `replicate` mutation → server. If the server rejects, the local write rolls back.
- **Read path:** UI → `collection.query()` → instant SQLite read. Works offline.
- **Sync:** Convex pushes CRDT deltas via subscription → client applies to SQLite.

### Auth flow

```
Browser                     SvelteKit Server              Logto                    Convex
  │── form POST signIn ────>│── redirect /authorize ──>│                           │
  │<── 302 to Logto ────────│                          │                           │
  │── login at Logto ──────────────────────────────────>│                           │
  │<── redirect with code ──────────────────────────────│                           │
  │── GET /callback ───────>│── exchange code ─────────>│                           │
  │                         │<── access + refresh token─│                           │
  │<── set-cookie + redirect│                          │                           │
  │                         │                          │                           │
  │── GET /api/convex-token>│── refresh if needed ────>│                           │
  │<── access token (JSON) ─│                          │                           │
  │                                                                                │
  │── WebSocket + token ──────────────────────────────────────────────────────────>│
  │<── authenticated ─────────────────────────────────────────────────────────────│
```

Key points:

- `@logto/sveltekit` handles everything server-side via `hooks.server.ts`
- Client gets Convex auth token via `GET /api/convex-token` server endpoint
- Convex validates using `customJwt` provider type (not standard OIDC) — this is required for Logto access tokens
- The `resources` array in the Logto hook config is required, or `getAccessToken()` fails

### Route structure

```
src/routes/
  +page.svelte              ← Public landing/login
  +layout.svelte            ← Root layout (Convex provider + auth)
  callback/                 ← Logto OAuth callback
  api/convex-token/         ← Server endpoint: returns Logto access token for Convex
  app/                      ← Authenticated routes (SSR DISABLED)
    +layout.ts              ← ssr=false + auth gate + localStorage fallback
    +layout.svelte          ← Nav shell
    flights/                ← Flight log
    aircraft/               ← Aircraft management
```

**Why `ssr = false` for `/app/*`:** Replicate uses WASM SQLite via OPFS — browser only. Client-rendering also enables offline hard-refresh via service worker.

**Why localStorage auth fallback:** When offline, the server can't provide user data. Caching user info in localStorage keeps the UI functional. Convex sync resumes when the token refreshes.

---

## Flight Entry Flow

This is the core UX of the app — logging a single airline flight. The form fields in order:

1. **Zulu date** — the UTC date the flight started
2. **Flight number** — e.g., "DL1234"
3. **Aircraft ID** — typeahead search by tail/serial number (e.g., "N839DN"). As the user types, results narrow. If no match, a "+" button lets them add a new aircraft inline (at minimum: tail number + type).
4. **Aircraft type** — auto-populated from the aircraft record. Not editable here if the aircraft already exists.
5. **From** — departure airport, typeahead by ICAO/IATA code or name
6. **To** — arrival airport, same typeahead
7. **Out** — gate departure, 4-digit Zulu (e.g., "2350")
8. **Off** — wheels up, 4-digit Zulu
9. **On** — wheels down, 4-digit Zulu
10. **In** — gate arrival, 4-digit Zulu
11. **Total time** — calculated from Out to In (block time), displayed in decimal hours. Editable for override.
12. **PIC time** — defaults to total time. Editable.
13. **Night time** — auto-calculated from sunrise/sunset at departure/arrival airports. Editable for override.
14. **Landings** — day count and night count. Schema must support future custom types (carrier day, carrier night, etc.)
15. **Approaches** — type (ILS, Visual, RNAV, etc.) + runway + airport. Always logged, even visuals (e.g., "LGA Visual Rwy 22").
16. **Remarks** — free text

**Batch entry:** Pilots typically log all flights at end of day or end of trip, not one at a time. The UI should make it easy to quickly enter multiple flights in sequence.

---

## Data Model

### Entity relationships

```
┌─────────────────┐
│  aircraft_type   │  "BCS3 = Airbus A220-300, Jet, Airplane MEL"
└────────┬────────┘
         │ referenced by
┌────────┴────────┐          ┌──────────────┐
│    aircraft      │          │   airports    │
│  "N839DN"        │          │  "KLGA"       │
└────────┬────────┘          │  user_id null  │ ← global (from dataset)
         │ referenced by     │  user_id set   │ ← user-custom
         │                   └───────┬────────┘
┌────────┴───────────────────────────┴────────┐
│              flights                         │
│  date, OOOI times, durations                │
│  landings: [{ type, count }]     ← embedded │
│  approaches: [{ type, rwy, … }] ← embedded │
└─────────────────────────────────────────────┘
```

### Why embed landings and approaches

- Always read/written with the flight, never queried independently
- Tiny arrays (1-3 landings, 0-2 approaches per flight)
- Deleting a flight cleans up automatically
- For aggregates ("total night landings this year"), query flights by date range and sum

### Landings schema — extensibility

MVP stores `landing_type` as a string: `"day"` or `"night"` with a count. Future custom types (carrier day trap, carrier night trap, FCLP, etc.) are just new string values — no schema migration needed. The UI will need to support adding custom type definitions, but the data model already handles it.

### OOOI time storage

**ISO 8601 UTC strings** (e.g., `"2024-03-15T23:50:00Z"`):

- Human-readable in dashboards and exports
- Lexicographically sortable and indexable
- Duration math via Temporal API: `Temporal.Instant.from(timeIn).since(Temporal.Instant.from(timeOut))`
- Convex recommends strings for calendar dates and clock times

**Parsing rule:** User enters 4-digit Zulu (e.g., "2350"). Each OOOI time resolves relative to the previous one. If the entered time is numerically less than the previous, it crossed midnight — add one day. OUT anchors to `flight_date`.

**`flight_date`** is a plain date string (`"2024-03-15"`) — the calendar date the trip started, not a timestamp.

### Duration fields

**Integer minutes.** Convert for display only (decimal hours for pilots: `minutes / 60`).

`total_time` (block time) can be computed from Out-to-In, but is stored explicitly for:

- Flights without full OOOI data (military imports: just date + total time)
- Manual overrides

### Night time calculation

Auto-calculated from sunrise/sunset times at the departure and arrival airports. Requires a sunrise/sunset dataset or algorithm (solar position calculation from lat/lon + date). The calculated value is stored on the flight and editable for override.

### Foreign keys

Replicate schemas use `v.string()` for cross-table references (not `v.id("table")`) because the client generates IDs offline via `crypto.randomUUID()`. Convex assigns its own `_id` internally.

### User isolation

Every table has `user_id` (Logto `sub` claim). Every query filters by it. This is the primary security boundary. Airports can have `user_id: null` for global/shared records from a pre-loaded dataset.

### Pre-loaded reference data

Airports and aircraft types should be seeded from open-source datasets if good ones exist. Users can add custom entries. Look for:

- Airport databases with ICAO/IATA codes, names, lat/lon (needed for night time calculation)
- Aircraft type databases with type designator, make, model, engine type, category, class

---

## Convex Integration Patterns

### Auth config (`src/convex/auth.config.ts`)

Uses `customJwt` provider (not standard OIDC) with Logto access tokens:

- `applicationID` = Logto API Resource identifier (e.g., `https://honu-log-api.dev`)
- `issuer` = `LOGTO_ENDPOINT + '/oidc'`
- `algorithm` = `RS256` (Logto must use RSA private keys, not EC)
- `jwks` = derived from `LOGTO_ENDPOINT` in prod, overridden by `LOGTO_JWKS_URL` in local dev (Docker networking)

### Replicate setup

Each table needs:

- A **Replicate schema definition** (shared between server and client) using `schema.define()` with Convex validators
- **Server functions** via `collection.create()` — generates `material`, `delta`, `replicate`, `presence`, `session`
- **Client collections** via `collection.create()` — connects to server functions with SQLite persistence
- A **Convex component registration** in `convex.config.ts`

Authorization must enforce that users can only read/write their own data. Check Replicate docs for the authorization hook API.

### Convex client + auth

`setupConvex()` from `convex-svelte` does NOT accept a `fetchAccessToken` option. You must call `client.setAuth(fetchToken)` separately. The `fetchToken` callback hits `/api/convex-token` and returns `null` when not authenticated.

---

## Environment & Infrastructure

### Local dev

- Convex: Docker on port 3210 (backend), 3211 (dashboard)
- Logto: Docker on port 3001
- SvelteKit: `bun run dev` on port 5173
- `npx convex dev --url ... --admin-key ...` running in a terminal for auto-deploy

### Production

- Convex: self-hosted on Coolify
- Logto: self-hosted on Coolify
- SvelteKit: deployed on Coolify, auto-deploys on push to main

### Environment variables

Two separate places:

| Variable                      | SvelteKit `.env.local` | Convex env (`npx convex env set`) |
| ----------------------------- | :--------------------: | :-------------------------------: |
| `LOGTO_ENDPOINT`              |          Yes           |                Yes                |
| `LOGTO_APP_ID`                |          Yes           |                 —                 |
| `LOGTO_APP_SECRET`            |          Yes           |                 —                 |
| `LOGTO_COOKIE_ENCRYPTION_KEY` |          Yes           |                 —                 |
| `LOGTO_API_IDENTIFIER`        |          Yes           |                Yes                |
| `PUBLIC_CONVEX_URL`           |          Yes           |                 —                 |
| `LOGTO_JWKS_URL`              |           —            |       Yes (local dev only)        |

---

## Gotchas

### Docker networking (local dev)

Convex runs in Docker. `localhost` inside the container ≠ your Mac. `ctx.auth.getUserIdentity()` silently returns `null` with no error.

**Fix:** Set `LOGTO_JWKS_URL=http://host.docker.internal:3001/oidc/jwks` as a Convex env var. Reference it in `auth.config.ts`. Not needed in production (real hostnames work).

Verify: `docker exec <container> sh -c "curl -s http://host.docker.internal:3001/oidc/jwks"`

### Logto `resources` array

The `resources` array in the Logto hook config tells Logto to include the API Resource in the OAuth grant. Without it, `getAccessToken()` fails with "resource indicator is missing." If you add `resources` after users have signed in, they must sign out and sign back in.

### Logto RSA keys

Self-hosted Logto must use RSA private keys (not EC) for JWT signing. Restart Docker after changing.

### JWT debugging

Decode tokens at jwt.io. Verify:

- `iss` matches `auth.config.ts` issuer exactly
- `aud` matches `applicationID` (the API Resource identifier, NOT the App ID)
- Mismatches are the #1 cause of auth failures

### WASM/Worker in Vite

Replicate's SQLite uses OPFS via a web worker. May need:

```typescript
// vite.config.ts
optimizeDeps: {
	exclude: ['@trestleinc/replicate'];
}
```

### Service worker scope

The service worker must NOT cache Convex WebSocket traffic or Logto auth endpoints. It only caches the app shell (HTML/CSS/JS). Replicate manages its own data sync.

### Convex function limits

Mutations should complete quickly and touch < a few hundred documents. For bulk imports (4000 flights from LogTen), batch in chunks of 50-100 per mutation, scheduled sequentially.

---

## Current State

**Done:**

- Auth flow end-to-end (Logto → SvelteKit → Convex customJwt)
- Convex setup with debug query (`whoami`)
- Token exchange endpoint (`/api/convex-token`)
- Root layout with Convex provider + auth
- App route auth gate with SSR=false and localStorage fallback
- Dev/prod environment configs
- Build tooling (vitest, eslint, prettier, svelte-check)
- Effect ecosystem + strict TypeScript

**Not done:**

- Flight data schema (current schema is placeholder `messages`/`users`)
- Replicate integration (server functions, client collections, component registration)
- Flight entry UI
- Aircraft/airport management
- Night time calculation
- Airport/aircraft type reference data seeding
- PWA (service worker + manifest)
- LogTen Pro import
- Tests
