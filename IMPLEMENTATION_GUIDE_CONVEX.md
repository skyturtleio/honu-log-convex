# Flight Logbook — Convex Implementation Guide

> **Purpose:** Take a basic SvelteKit scaffolded app to a fully working offline-first flight logbook using Convex as the backend. This guide is intended to be followed step-by-step by a developer (with AI assistance).

> **Starting point:** A new SvelteKit app created with `npx sv create`, with nothing else wired up.

> **End state:** A working flight logbook app with auth (self-hosted Logto), offline reads/writes (self-hosted Convex + Replicate), and a PWA shell.

> **Philosophy:** Fully embrace Convex and its best practices. Convex (self-hosted) is the database, the server, and the sync engine. Replicate provides offline reads/writes via local SQLite with CRDT-based sync. No hand-rolled API endpoints — Convex mutations handle the write path.

---

## How to use this guide with AI coding assistants

This guide is designed for **one step (or a few sub-steps) per AI session**. Each step has a **Context** block at the top so a fresh session can orient itself without reading the entire guide.

**Starting a session:**
> "Read @IMPLEMENTATION_GUIDE_CONVEX.md. We are going to implement step 4 in this session."

**Ending a session:** After the code looks good:
> "Update the implementation guide to mark step 4 as complete, note anything that deviated from the plan, and commit."

---

## Session Map

| Session | Steps | What gets built | Status |
|---------|-------|-----------------|--------|
| 1 | 1–3 | Environment, deps, Auth (Logto + Convex OIDC) | |
| 2 | 4 | Convex schema | |
| 3 | 5–6 | Replicate server functions + client collections | |
| 4 | 7 | App layout + offline auth resilience | |
| 5 | 8 | Flight logbook UI | |
| 6 | 9 | PWA (service worker + manifest) | |
| 7 | 10–11 | Testing + deploy prep | |

---

## Table of Contents

1. [Environment & Prerequisites](#1-environment--prerequisites)
2. [Project Setup & Dependencies](#2-project-setup--dependencies)
3. [Auth Integration (Logto + Convex)](#3-auth-integration-logto--convex)
4. [Convex Schema](#4-convex-schema)
5. [Replicate Server Functions](#5-replicate-server-functions)
6. [Replicate Client Collections](#6-replicate-client-collections)
7. [App Layout & Offline Auth Resilience](#7-app-layout--offline-auth-resilience)
8. [Basic Flight Logbook UI](#8-basic-flight-logbook-ui)
9. [PWA Setup (Service Worker & Manifest)](#9-pwa-setup-service-worker--manifest)
10. [Testing the Offline Flow](#10-testing-the-offline-flow)
11. [Deploying to Production](#11-deploying-to-production)

---

## Architecture Overview

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
│  Convex (self-hosted) │                          │
│                    ↕                             │
│  replicate mutation ←→ Convex Database           │
│                         (documents + CRDT state) │
│                                                  │
│  Auth: validates Logto JWTs via OIDC             │
└──────────────────────────────────────────────────┘
```

**Write path:** UI → collection.insert() → instant SQLite write → debounced Convex `replicate` mutation → self-hosted Convex DB. If the server rejects (e.g., auth failure), the local write rolls back automatically.

**Read path:** UI → collection.query() → instant SQLite read (works offline).

**Sync path:** Self-hosted Convex pushes CRDT deltas via subscription → client applies to SQLite.

---

## 1. Environment & Prerequisites

> **Context:** Starting from scratch. This step sets up everything you need before writing code.

### What you need running

- **Convex (self-hosted)** — running locally via Docker or the open-source binary. Backend on port 3210, site/dashboard on port 3211.
- **Logto** — self-hosted on Coolify (production) or in Docker locally (development). Port 3001 for local dev.
- **Docker Desktop** — for running both Convex and Logto locally.
- **bun** — package manager
- **Node.js 18+** — for Convex CLI

### Set up self-hosted Convex

1. Follow the [Convex self-hosting guide](https://github.com/get-convex/convex-backend) to run Convex locally
2. The backend runs on `http://127.0.0.1:3210` and the site/dashboard on `http://127.0.0.1:3211`
3. Generate an admin key — you'll need this for all `npx convex` CLI commands
4. No Convex cloud account needed

### Set up Logto locally (if not already running)

Run Logto in Docker on port 3001. Create a **Traditional Web Application** (server-side auth via `@logto/sveltekit`):

1. Open Logto Console at `http://localhost:3001`
2. Create a new **Traditional Web Application**
3. Set redirect URI to `http://localhost:5173/callback`
4. Set post sign-out redirect URI to `http://localhost:5173/`
5. Copy the App ID and App Secret (you'll need both)
6. **Create an API Resource** with identifier like `https://honu-log-api.dev` (this becomes the `applicationID` in Convex auth config and the `audience` when requesting tokens)

> **Note:** We use a Traditional Web Application type because `@logto/sveltekit` handles the OAuth flow server-side via `hooks.server.ts`. The server manages sessions, token exchange, and token refresh. You'll also need a `LOGTO_COOKIE_ENCRYPTION_KEY` for encrypting the session cookie.

---

## 2. Project Setup & Dependencies

> **Context:** Step 1 is complete. Logto is running, self-hosted Convex is running. This step scaffolds the SvelteKit project, installs dependencies, and initializes Convex.

### 2.1 Scaffold the SvelteKit project

```bash
npx sv create honu-log-convex
# Select: SvelteKit minimal, TypeScript, etc.
cd honu-log-convex
```

### 2.2 Install dependencies

```bash
# Convex
bun add convex convex-svelte

# Replicate (offline sync + TanStack DB collections)
bun add @trestleinc/replicate

# Logto SvelteKit SDK (server-side auth)
bun add @logto/sveltekit
```

> **Note:** Replicate bundles TanStack DB internally — no separate `@tanstack/*` packages needed.

### 2.3 Configure Convex for SvelteKit

SvelteKit doesn't like referencing code outside `src/`. Create `convex.json` in project root:

```json
{
  "functions": "src/convex/"
}
```

### 2.4 Initialize Convex (self-hosted)

```bash
npx convex dev --url http://127.0.0.1:3210 --admin-key <your-admin-key>
```

This will:
- Connect to your self-hosted Convex instance
- Deploy your schema and functions
- Start watching for changes and pushing to the self-hosted backend

> **Keep `npx convex dev` running** in a terminal during development. It auto-deploys your schema and functions on every save. All CLI commands (`convex dev`, `convex deploy`, `convex env set`, etc.) require the `--url` and `--admin-key` flags when using self-hosted Convex.

### 2.5 Environment variables

Your `.env.local` (already in `.gitignore`):

```bash
# Logto Auth (server-side, used in src/hooks.server.ts)
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_APP_ID=<your-logto-app-id>
LOGTO_APP_SECRET=<your-logto-app-secret>
LOGTO_COOKIE_ENCRYPTION_KEY=<random-32-char-string>

# Convex (self-hosted)
PUBLIC_CONVEX_URL=http://127.0.0.1:3210

# Convex Self-hosted CLI config
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<your-admin-key>

# Logto API Resource identifier (used by Convex auth + client token requests)
LOGTO_API_IDENTIFIER=https://honu-log-api.dev
PUBLIC_LOGTO_API_IDENTIFIER=https://honu-log-api.dev

# Convex site URL (dashboard/HTTP actions)
PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211
```

#### Environment variable reference

There are **two separate places** where env vars are set, and they serve different purposes:

| Variable | `.env.local` (SvelteKit) | Convex Dashboard / CLI | Notes |
|----------|:---:|:---:|-------|
| `LOGTO_ENDPOINT` | Yes | Yes | SvelteKit uses it for the OAuth flow. Convex uses it for the JWT `issuer` claim match. Always `http://localhost:3001` locally, `https://auth.yourdomain.com` in prod. |
| `LOGTO_APP_ID` | Yes | — | Only used by SvelteKit's `@logto/sveltekit` hook |
| `LOGTO_APP_SECRET` | Yes | — | Only used by SvelteKit server-side |
| `LOGTO_COOKIE_ENCRYPTION_KEY` | Yes | — | Only used by SvelteKit server-side |
| `LOGTO_API_IDENTIFIER` | Yes | Yes | SvelteKit uses it to request scoped access tokens. Convex uses it as the `applicationID` to match JWT audience. |
| `PUBLIC_LOGTO_API_IDENTIFIER` | Yes | — | Public mirror for client-side code if needed |
| `LOGTO_JWKS_URL` | — | Yes (local dev only) | **Local dev only.** Override for the JWKS URL so Convex's Docker container can reach Logto. `auth.config.ts` falls back to `LOGTO_ENDPOINT + '/oidc/jwks'` when unset, so this is not needed in production. |
| `PUBLIC_CONVEX_URL` | Yes | — | The Convex backend URL the browser connects to |
| `CONVEX_SELF_HOSTED_URL` | Yes | — | Used by `npx convex` CLI commands |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Yes | — | Used by `npx convex` CLI commands |
| `PUBLIC_CONVEX_SITE_URL` | Yes | — | Convex dashboard/HTTP actions URL |

Set the Logto config as Convex environment variables via CLI:

```bash
npx convex env set LOGTO_ENDPOINT http://localhost:3001
npx convex env set LOGTO_API_IDENTIFIER https://honu-log-api.dev
# Local dev only — see Docker networking note below:
npx convex env set LOGTO_JWKS_URL http://host.docker.internal:3001/oidc/jwks
```

#### Docker networking (local dev only)

> **Critical gotcha for self-hosted Convex:** The Convex backend runs inside a Docker container. When `auth.config.ts` references `http://localhost:3001/oidc/jwks`, `localhost` inside Docker means "this container" — not your Mac where Logto actually runs. The JWKS fetch silently fails, and Convex can't verify any JWT. This manifests as `ctx.auth.getUserIdentity()` always returning `null` with no visible error.
>
> **The fix:** Use `host.docker.internal` — a special Docker DNS name that resolves to the host machine. Set `LOGTO_JWKS_URL=http://host.docker.internal:3001/oidc/jwks` as a Convex env var, and reference it separately in `auth.config.ts`.
>
> **This is a local dev issue only.** In production, both Logto and Convex have real hostnames (e.g., `https://auth.yourdomain.com`) that are mutually reachable. No `host.docker.internal` needed — a single `LOGTO_ENDPOINT` works for both `issuer` and `jwks`.
>
> You can verify reachability from the Convex container:
> ```bash
> docker exec <convex-container-name> sh -c "curl -s http://host.docker.internal:3001/oidc/jwks"
> ```

---

## 3. Auth Integration (Logto + Convex)

> **Context:** Steps 1–2 are complete. SvelteKit project exists, Convex is initialized, dependencies installed. This step wires up authentication early so we have user IDs ready before defining the schema, and so we can verify the hardest integration point first.

### Architecture

```
Browser                     SvelteKit Server              Logto                    Convex (self-hosted)
  │                              │                          │                        │
  │── form POST signIn ─────────>│                          │                        │
  │                              │── redirect /authorize ──>│                        │
  │<──────── 302 redirect ───────│                          │                        │
  │── follow redirect ──────────────────────────────────────>│                        │
  │<── redirect with auth code ──────────────────────────────│                        │
  │── GET /callback ────────────>│                          │                        │
  │                              │── exchange code for tokens>│                       │
  │                              │<── access + refresh token ─│                       │
  │                              │  (stored in encrypted cookie)                      │
  │<── set-cookie + redirect ────│                          │                        │
  │                              │                          │                        │
  │── GET /api/convex-token ────>│                          │                        │
  │                              │── refresh if needed ────>│                        │
  │<── access token (JSON) ──────│                          │                        │
  │                                                                                  │
  │── WebSocket + access token ─────────────────────────────────────────────────────>│
  │                                                                                  │── verify JWT
  │                                                                                  │   via Logto JWKS
  │<── authenticated connection ─────────────────────────────────────────────────────│
```

The `@logto/sveltekit` SDK handles the OAuth flow server-side via `hooks.server.ts`. The server manages sessions in encrypted cookies. To authenticate the Convex WebSocket, the client fetches an **access token** (not ID token) from a server endpoint, which the server obtains from the Logto session. The self-hosted Convex instance verifies it via Logto's JWKS endpoint using the `customJwt` provider type.

> **Proven working:** This configuration comes from [a confirmed working setup](https://github.com/get-convex/convex-backend/issues/75#issuecomment-2918783173) of SvelteKit + Logto + Convex. The key insight is using `customJwt` with Logto's access token (not the standard OIDC ID token flow), which also gives you Logto's scopes/permissions in Convex functions.

### 3.1 Logto setup for Convex

In Logto Console:

1. **Create a Traditional Web Application** — not SPA. `@logto/sveltekit` handles auth server-side.
2. **Use RSA algorithm for private keys** — for self-hosted Logto, check your private key config and restart the Docker service after changing
3. **Create an API Resource** with an identifier like `https://honu-log-api.dev` (this becomes the `applicationID` in Convex and the `audience` when requesting tokens)
4. **Create permissions (scopes)** and user roles if needed (optional for MVP — useful later for admin features)
5. **(Optional) Customize access token claims** — add user email/name so Convex functions can access them without a separate lookup. In Logto Console → JWT Customization:

```javascript
const getCustomJwtClaims = async ({ token, context, environmentVariables, api }) => {
	return {
		email: context.user.primaryEmail,
		username: context.user.username
	};
};
```

### 3.2 Convex auth config

#### `src/convex/auth.config.ts`

```typescript
// In local dev, self-hosted Convex runs in Docker where `localhost` doesn't
// reach the host machine. LOGTO_JWKS_URL (set to host.docker.internal) overrides
// the JWKS endpoint so the container can fetch Logto's signing keys.
// In production, LOGTO_JWKS_URL is unset and we derive it from LOGTO_ENDPOINT.
const jwks =
	process.env.LOGTO_JWKS_URL || process.env.LOGTO_ENDPOINT + '/oidc/jwks';

export default {
	providers: [
		{
			type: 'customJwt',
			applicationID: process.env.LOGTO_API_IDENTIFIER!,
			// Must match the `iss` claim in the JWT
			issuer: process.env.LOGTO_ENDPOINT + '/oidc',
			jwks,
			algorithm: 'RS256'
		}
	]
};
```

Set the environment variables via Convex CLI:

```bash
npx convex env set LOGTO_ENDPOINT http://localhost:3001
npx convex env set LOGTO_API_IDENTIFIER https://honu-log-api.dev
# Local dev only — Convex runs in Docker, so localhost doesn't reach your host:
npx convex env set LOGTO_JWKS_URL http://host.docker.internal:3001/oidc/jwks
```

> **Production:** Don't set `LOGTO_JWKS_URL`. The config falls back to `LOGTO_ENDPOINT + '/oidc/jwks'` automatically, which works when both services have real hostnames.

> **What you get in Convex functions:** After auth is configured, `ctx.auth.getUserIdentity()` returns:
> ```json
> {
>   "tokenIdentifier": "https://...",
>   "issuer": "https://your-logto/oidc",
>   "subject": "user-uuid",
>   "client_id": "your-app-id",
>   "email": "pilot@example.com",
>   "scope": "your:permissions",
>   "username": "callsign"
> }
> ```
> The `subject` field is the user's Logto `sub` — use this as `user_id` throughout.

> **Verify with jwt.io:** After getting an access token from Logto, decode it and confirm `iss` matches your issuer URL and `aud` matches your `applicationID`. Mismatches are the #1 cause of auth failures.

### 3.3 Auth helper (server-side)

Create a reusable helper following Convex best practices ("most logic should be written as plain TypeScript functions"):

#### `src/convex/model/auth.ts`

```typescript
import { QueryCtx, MutationCtx } from '../_generated/server';

export async function getAuthUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Not authenticated');
	return identity;
}

export async function getUserId(ctx: QueryCtx | MutationCtx) {
	const identity = await getAuthUser(ctx);
	return identity.subject; // Logto `sub` claim
}
```

### 3.4 Server-side auth via hooks.server.ts (already implemented)

Auth is handled entirely server-side by `@logto/sveltekit`. The existing `src/hooks.server.ts` initializes the Logto middleware:

```typescript
// src/hooks.server.ts (ALREADY EXISTS — do not recreate)
import { handleLogto } from '@logto/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';

const logtoHook = handleLogto(
	{
		endpoint: env.LOGTO_ENDPOINT,
		appId: env.LOGTO_APP_ID,
		appSecret: env.LOGTO_APP_SECRET,
		// Request access tokens scoped to the Convex API Resource.
		// Without this, getAccessToken('https://honu-log-api.dev') fails with
		// "resource indicator is missing, or unknown".
		resources: [env.LOGTO_API_IDENTIFIER!]
	},
	{ encryptionKey: env.LOGTO_COOKIE_ENCRYPTION_KEY }
);

export const handle = sequence(logtoHook);
```

This provides `locals.logtoClient` and `locals.user` on every server request. No client-side Logto SDK is needed.

> **Important:** The `resources` array tells Logto to include the API Resource in the OAuth grant. Without it, the session won't have access to the resource, and `getAccessToken()` will fail. If you add `resources` after users have already signed in, they must **sign out and sign back in** to get a new session with the resource scope.

### 3.4.1 Server endpoint for Convex access tokens

The Convex WebSocket needs a Logto **access token** scoped to the API Resource. Create a server endpoint that the client calls to fetch this token:

#### `src/routes/api/convex-token/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const logtoClient = locals.logtoClient;

	// Get access token scoped to the Convex API Resource
	// The resource identifier must match LOGTO_API_IDENTIFIER in Convex env
	try {
		const token = await logtoClient.getAccessToken('https://honu-log-api.dev');
		if (!token) throw error(401, 'No access token available');
		return json({ token });
	} catch (err) {
		throw error(401, 'Not authenticated or token expired');
	}
};
```

> **Key insight:** The client calls `fetch('/api/convex-token')` to get a fresh access token whenever the Convex client needs to authenticate. The server uses the Logto session cookie to obtain/refresh the token transparently.

### 3.5 Callback route

The `@logto/sveltekit` SDK handles the OAuth callback server-side automatically via the hooks middleware. You just need a simple page at the callback URL that redirects after the server processes the auth code:

#### `src/routes/callback/+page.server.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The Logto hook already handled the callback by the time we get here.
	// If authenticated, redirect to the app.
	if (locals.user) {
		redirect(302, '/app/flights');
	}
	// If not authenticated after callback, redirect to home
	redirect(302, '/');
};
```

#### `src/routes/callback/+page.svelte`

```svelte
<p>Signing in...</p>
```

### 3.6 Landing page (already implemented)

The landing page uses server-side form actions for sign-in/out. This is already implemented:

#### `src/routes/+page.server.ts` (ALREADY EXISTS)

```typescript
import type { Actions } from './$types';

export const actions: Actions = {
	signIn: async ({ locals }) => {
		await locals.logtoClient.signIn('http://localhost:5173/callback');
	},
	signOut: async ({ locals }) => {
		await locals.logtoClient.signOut('http://localhost:5173/');
	}
};
```

#### `src/routes/+layout.server.ts` (ALREADY EXISTS)

```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};
```

#### `src/routes/+page.svelte` (ALREADY EXISTS — update to add logbook link)

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>Flight Logbook</h1>

{#if data.user}
	<p><a href={resolve('/app/flights')}>Go to Logbook</a></p>
	<form method="POST" action="?/signOut">
		<button type="submit">Sign Out</button>
	</form>
{:else}
	<form method="POST" action="?/signIn">
		<button type="submit">Sign In</button>
	</form>
{/if}
```

> **No client-side auth SDK needed.** The server provides `data.user` via `+layout.server.ts`. Form actions handle sign-in/out via server-side Logto client.

### 3.7 Convex provider with auth

#### `src/routes/+layout.svelte`

Wire up the Convex client with Logto token fetching via the server endpoint:

```svelte
<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
	const client = useConvexClient();

	async function fetchToken() {
		const res = await fetch('/api/convex-token');
		if (!res.ok) return null;
		const data = await res.json();
		return data.token;
	}

	// Only set auth when user is logged in to avoid 401 noise in console
	let hasUser = $derived(!!page.data.user);
	$effect(() => {
		if (hasUser) {
			client.setAuth(fetchToken);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
```

> **Implementation note:** `setupConvex` does NOT accept a `fetchAccessToken` option — confirmed by reading `convex-svelte` source. You must call `client.setAuth(fetchToken)` separately on the `ConvexClient` instance. The `$effect` is appropriate here because `setAuth` is an imperative call to an external library triggered by reactive auth state. The `fetchToken` callback returns `null` when not authenticated, which is what the Convex `setAuth` API expects.

---

## 4. Convex Schema

> **Context:** Steps 1–3 are complete. Auth is wired up — you have a working sign-in flow and user IDs from Logto's `sub` claim. This step defines the database schema — the single source of truth for all flight data.

### Entity relationship overview

Landings and approaches are embedded as arrays in the flights document rather than separate tables:

```
┌─────────────────┐
│  aircraft_type   │  "BCS3 is an Airbus A-220-300, Jet, Airplane MEL"
└────────┬────────┘
         │ referenced by
         │
┌────────┴────────┐          ┌──────────────┐
│    aircraft      │          │   airports    │
│  "N332DU"        │          │  "KLGA"       │
└────────┬────────┘          │  user_id null  │ ← global
         │ referenced by     │  = shared      │
         │                   │  user_id set   │ ← user-custom
┌────────┴───────────────────┴──────┐
│              flights               │
│  date, OOOI timestamps, durations │
│  landings: [{ type, count }]      │  ← embedded array
│  approaches: [{ type, rwy, ... }] │  ← embedded array
└───────────────────────────────────┘
```

### Why embed landings and approaches

Landings and approaches are embedded arrays in the flight document because:

- They're always read/written in the context of a flight — never queried independently
- Deleting a flight automatically deletes its landings/approaches
- One read gets the full flight record (no joins, fewer function calls)
- The arrays are tiny (1–3 landings, 0–2 approaches per flight)
- For aggregates ("total night landings this year"), query flights by date range and sum the embedded arrays

### OOOI time storage design

OOOI times (Out, Off, On, In) are stored as **ISO 8601 UTC strings** (`v.string()`), following Convex's recommendation to store calendar dates and clock times as strings. Example: `"2024-03-15T23:50:00Z"`.

**Why ISO 8601 strings:**
- Human-readable in the Convex dashboard, logs, and JSON exports
- Lexicographically sortable and indexable
- Duration math is easy via the Temporal API: `Temporal.Instant.from(timeIn).since(Temporal.Instant.from(timeOut))`
- Convex recommends strings for "calendar dates and clock times" — OOOI times are exactly that

**`flight_date` stays as a string** (`"2024-03-15"`) — it's a calendar concept (the date the trip started), not a point in time.

**UI input flow:**
1. User picks a flight date: `2024-03-15`
2. User enters OUT: `2350` → stored as `"2024-03-15T23:50:00Z"`
3. User enters OFF: `0010` → numerically less than `2350`, so next day → `"2024-03-16T00:10:00Z"`
4. User enters ON: `0340` → still after OFF → `"2024-03-16T03:40:00Z"`
5. User enters IN: `0355` → still after ON → `"2024-03-16T03:55:00Z"`

**Parsing rule:** Each OOOI time is resolved relative to the previous one. If the entered time (as HHMM) is numerically less than the previous time, it rolled past midnight — add one day. OUT anchors to `flight_date`.

**Display:** Extract `HH:MM` from the ISO string (e.g., `"2024-03-15T23:50:00Z"` → `"23:50"`).

**Date/time handling:** Use the Temporal API (`Temporal.PlainDate`, `Temporal.Instant`) for all parsing, comparison, and duration math. Temporal is now available in modern JS runtimes and eliminates the footguns of `Date`.

### 4.1 Replicate schema definitions

Create one schema file per entity in `src/convex/schema/`. These definitions are shared between server (Convex functions) and client (Replicate collections).

#### `src/convex/schema/aircraft_type.ts`

```typescript
import { v } from 'convex/values';
import { schema } from '@trestleinc/replicate/server';

export const aircraftTypeSchema = schema.define({
	shape: v.object({
		id: v.string(),
		user_id: v.string(),
		type_code: v.string(),
		make: v.optional(v.string()),
		model: v.optional(v.string()),
		engine_type: v.optional(v.string()),
		category: v.string(),
		aircraft_class: v.string()
	}),
	indexes: (t) => t.index('by_user', ['user_id']),
	defaults: {
		category: 'Airplane',
		aircraft_class: 'Multi-Engine Land'
	}
});
```

#### `src/convex/schema/aircraft.ts`

```typescript
import { v } from 'convex/values';
import { schema } from '@trestleinc/replicate/server';

export const aircraftSchema = schema.define({
	shape: v.object({
		id: v.string(),
		user_id: v.string(),
		tail_number: v.string(),
		aircraft_type_id: v.string() // Convex doc ID as string
	}),
	indexes: (t) => t.index('by_user', ['user_id']),
	defaults: {}
});
```

#### `src/convex/schema/airports.ts`

```typescript
import { v } from 'convex/values';
import { schema } from '@trestleinc/replicate/server';

export const airportSchema = schema.define({
	shape: v.object({
		id: v.string(),
		user_id: v.optional(v.string()), // null = global, set = user-custom
		icao_code: v.string(),
		name: v.optional(v.string())
	}),
	indexes: (t) => t.index('by_user', ['user_id']).index('by_icao', ['icao_code']),
	defaults: {}
});
```

#### `src/convex/schema/flights.ts`

```typescript
import { v } from 'convex/values';
import { schema } from '@trestleinc/replicate/server';

export const flightSchema = schema.define({
	shape: v.object({
		id: v.string(),
		user_id: v.string(),
		aircraft_id: v.optional(v.string()),

		// Date & Route
		flight_date: v.string(), // "2024-03-15" (ISO date string, the date the trip started)
		flight_number: v.optional(v.string()),
		departure_airport_id: v.optional(v.string()),
		arrival_airport_id: v.optional(v.string()),

		// OOOI Times — ISO 8601 UTC strings (e.g. "2024-03-15T23:50:00Z")
		// User enters "2350" in Zulu, we resolve to full ISO string anchored to flight_date
		time_out: v.optional(v.string()),
		time_off: v.optional(v.string()),
		time_on: v.optional(v.string()),
		time_in: v.optional(v.string()),

		// Duration fields — integer MINUTES
		// total_time (block) and flight_time can be computed from OOOI times,
		// but kept as explicit fields for flights logged without full OOOI data
		total_time: v.number(),
		pic: v.optional(v.number()),
		sic: v.optional(v.number()),
		night: v.optional(v.number()),
		cross_country: v.optional(v.number()),
		actual_instrument: v.optional(v.number()),
		solo: v.optional(v.number()),
		dual_received: v.optional(v.number()),
		dual_given: v.optional(v.number()),

		remarks: v.optional(v.string()),

		// Embedded landing and approach data
		landings: v.optional(
			v.array(
				v.object({
					landing_type: v.string(), // "day", "night", "carrier_day", etc.
					count: v.number()
				})
			)
		),
		approaches: v.optional(
			v.array(
				v.object({
					approach_type: v.string(), // "ILS", "Visual", "RNAV", etc.
					runway: v.optional(v.string()),
					airport_id: v.optional(v.string()),
					count: v.number()
				})
			)
		)
	}),
	indexes: (t) =>
		t.index('by_user', ['user_id']).index('by_user_date', ['user_id', 'flight_date']),
	defaults: {
		pic: 0,
		sic: 0,
		night: 0,
		cross_country: 0,
		actual_instrument: 0,
		solo: 0,
		dual_received: 0,
		dual_given: 0,
		landings: [],
		approaches: []
	}
});
```

### 4.2 Convex schema (wire it up)

#### `src/convex/schema.ts`

```typescript
import { defineSchema } from 'convex/server';
import { aircraftTypeSchema } from './schema/aircraft_type';
import { aircraftSchema } from './schema/aircraft';
import { airportSchema } from './schema/airports';
import { flightSchema } from './schema/flights';

export default defineSchema({
	aircraft_type: aircraftTypeSchema.table(),
	aircraft: aircraftSchema.table(),
	airports: airportSchema.table(),
	flights: flightSchema.table()
});
```

### 4.3 Register Replicate component

#### `src/convex/convex.config.ts`

```typescript
import { defineApp } from 'convex/server';
import replicate from '@trestleinc/replicate/component';

const app = defineApp();
app.use(replicate);
export default app;
```

### Design notes

- **4 tables** — landings and approaches are embedded arrays in flights, so no separate tables or cascade logic needed.
- **`id` is a string field on the shape** — Replicate uses this as the client-side document key (`crypto.randomUUID()`). Convex also assigns its own `_id` internally.
- **Foreign keys are strings** — Convex `v.id("table")` validates at write time, but Replicate schemas use `v.string()` for cross-table references since the client generates IDs offline.
- **`user_id` is the Logto `sub` claim.** Every query filters by it.
- **Duration fields are integer minutes** — convert for display only.
- **OOOI times are ISO 8601 UTC strings** — e.g. `"2024-03-15T23:50:00Z"`. Human-readable, sortable, following Convex's recommendation for clock times. User enters Zulu HHMM, client resolves to full ISO string with midnight-rollover logic. Use Temporal API for parsing and duration math.
- **Defaults are declared in the schema** — Replicate applies these on insert.
- **No `created_at`/`updated_at`** — Convex provides `_creationTime` automatically. Replicate tracks `timestamp` internally for sync ordering. If you need `updated_at` for display, add it to the shape and set it in your mutation logic.

---

## 5. Replicate Server Functions

> **Context:** Steps 1–4 are complete. Schema defined, auth wired up. This step creates the Convex functions that Replicate uses to sync data between clients and the server.

### What Replicate needs on the server

For each collection, `collection.create()` generates 5 Convex functions:
- `material` — paginated query for SSR seeding
- `delta` — real-time CRDT subscription
- `replicate` — unified insert/update/delete mutation
- `presence` — session management
- `session` — connected user queries

### 5.1 Create server functions (one file per table)

#### `src/convex/aircraft_types.ts`

```typescript
import { collection } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { aircraftTypeSchema } from './schema/aircraft_type';

export const { material, delta, replicate, presence, session } =
	collection.create<Doc<'aircraft_type'>>(components.replicate, 'aircraft_type', {
		schema: aircraftTypeSchema
	});
```

#### `src/convex/aircraft.ts`

```typescript
import { collection } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { aircraftSchema } from './schema/aircraft';

export const { material, delta, replicate, presence, session } =
	collection.create<Doc<'aircraft'>>(components.replicate, 'aircraft', {
		schema: aircraftSchema
	});
```

#### `src/convex/airports.ts`

```typescript
import { collection } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { airportSchema } from './schema/airports';

export const { material, delta, replicate, presence, session } =
	collection.create<Doc<'airports'>>(components.replicate, 'airports', {
		schema: airportSchema
	});
```

#### `src/convex/flights.ts`

```typescript
import { collection } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { flightSchema } from './schema/flights';

export const { material, delta, replicate, presence, session } =
	collection.create<Doc<'flights'>>(components.replicate, 'flights', {
		schema: flightSchema
	});
```

### 5.2 Access control

Replicate's `collection.create()` handles the CRUD operations. To enforce that users can only access their own data, you need to add authorization logic. Check the Replicate docs for the authorization hook API — it likely supports an `authorize` callback or similar mechanism in `collection.create()` options.

The authorization should:
- On insert: verify the `user_id` field matches the authenticated user's `sub` claim
- On update/delete: verify the document belongs to the authenticated user
- On read (material/delta): filter to only return documents where `user_id` matches

> **This is the most important security boundary.** The authorization logic is centralized in one place per collection. If Replicate doesn't support authorization hooks directly, wrap the generated functions with auth checks.

---

## 6. Replicate Client Collections

> **Context:** Steps 1–5 are complete. Server functions exist for all 4 tables. This step creates the client-side collections that provide offline reads/writes via local SQLite.

### 6.1 SQLite persistence setup

#### `src/lib/replicate/persistence.ts`

```typescript
import { persistence } from '@trestleinc/replicate/client';

export const sqlite = persistence.web.sqlite.once({
	name: 'honu-log',
	worker: async () => {
		const { default: SqliteWorker } = await import(
			'@trestleinc/replicate/worker?worker'
		);
		return new SqliteWorker();
	}
});
```

### 6.2 Create client collections (one file per table)

#### `src/lib/collections/aircraft_types.ts`

```typescript
import { collection } from '@trestleinc/replicate/client';
import { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { aircraftTypeSchema } from '../../convex/schema/aircraft_type';
import { sqlite } from '../replicate/persistence';
import type { Infer } from 'convex/values';

export type AircraftType = Infer<typeof aircraftTypeSchema.shape>;

export const aircraftTypes = collection.create({
	schema: aircraftTypeSchema,
	persistence: sqlite,
	config: () => ({
		convexClient: getConvexClient(), // see 6.3
		api: api.aircraft_types,
		getKey: (doc: AircraftType) => doc.id
	})
});
```

#### `src/lib/collections/aircraft.ts`

```typescript
import { collection } from '@trestleinc/replicate/client';
import { api } from '../../convex/_generated/api';
import { aircraftSchema } from '../../convex/schema/aircraft';
import { sqlite } from '../replicate/persistence';
import type { Infer } from 'convex/values';

export type Aircraft = Infer<typeof aircraftSchema.shape>;

export const aircraft = collection.create({
	schema: aircraftSchema,
	persistence: sqlite,
	config: () => ({
		convexClient: getConvexClient(),
		api: api.aircraft,
		getKey: (doc: Aircraft) => doc.id
	})
});
```

#### `src/lib/collections/airports.ts`

```typescript
import { collection } from '@trestleinc/replicate/client';
import { api } from '../../convex/_generated/api';
import { airportSchema } from '../../convex/schema/airports';
import { sqlite } from '../replicate/persistence';
import type { Infer } from 'convex/values';

export type Airport = Infer<typeof airportSchema.shape>;

export const airports = collection.create({
	schema: airportSchema,
	persistence: sqlite,
	config: () => ({
		convexClient: getConvexClient(),
		api: api.airports,
		getKey: (doc: Airport) => doc.id
	})
});
```

#### `src/lib/collections/flights.ts`

```typescript
import { collection } from '@trestleinc/replicate/client';
import { api } from '../../convex/_generated/api';
import { flightSchema } from '../../convex/schema/flights';
import { sqlite } from '../replicate/persistence';
import type { Infer } from 'convex/values';

export type Flight = Infer<typeof flightSchema.shape>;

export const flights = collection.create({
	schema: flightSchema,
	persistence: sqlite,
	config: () => ({
		convexClient: getConvexClient(),
		api: api.flights,
		getKey: (doc: Flight) => doc.id
	})
});
```

### 6.3 Shared Convex client

The collections need a shared Convex client instance. Create a singleton:

#### `src/lib/replicate/convex-client.ts`

```typescript
import { ConvexClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

let client: ConvexClient | null = null;

export function getConvexClient() {
	if (!client) {
		client = new ConvexClient(PUBLIC_CONVEX_URL);
	}
	return client;
}
```

> **Implementation note:** The Convex client used by Replicate collections may need auth tokens set on it. Check whether `convex-svelte`'s `setupConvex` shares a client that Replicate can use, or if you need to configure auth on this separate client. The auth token from Logto must flow through to the Replicate sync calls.

### 6.4 Initialize collections

Collections must be initialized once on app startup. This happens in the app layout (step 7). The `init()` call connects to Convex and begins syncing:

```typescript
await aircraftTypes.init();
await aircraft.init();
await airports.init();
await flights.init();
```

---

## 7. App Layout & Offline Auth Resilience

> **Context:** Steps 1–6 are complete. Server functions and client collections are defined. This step creates the route structure with an authenticated app shell that supports offline use.

### Route structure

```
src/routes/
  +page.svelte              ← Public landing/login page — done in step 3
  +layout.svelte            ← Root layout (Convex provider) — done in step 3
  callback/
    +page.svelte            ← Logto callback — done in step 3
  app/                      ← Authenticated routes (SSR DISABLED)
    +layout.ts              ← ssr = false + auth gate + localStorage caching
    +layout.svelte          ← Nav + children rendering
    flights/
      +page.svelte          ← Flight list & entry (step 8)
    aircraft/
      +page.svelte          ← Aircraft management (step 8)
```

> **Why `app/` and not `(app)/`?** SvelteKit route groups with parentheses (e.g., `(app)`) strip the group name from the URL — so `(app)/flights` becomes `/flights`. We want the URL to be `/app/flights`, so we use a regular `app/` directory.

### 7.1 App layout — SSR disabled + auth gate

#### `src/routes/app/+layout.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const ssr = false;

const CACHED_USER_KEY = 'honu_cached_user';

export const load: LayoutLoad = async ({ parent }) => {
	const { user } = await parent();

	if (user) {
		localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
		return { user };
	}

	// Offline fallback: check localStorage
	const stored = localStorage.getItem(CACHED_USER_KEY);
	if (stored) {
		try {
			return { user: JSON.parse(stored) };
		} catch {
			// fall through to redirect
		}
	}

	redirect(302, '/');
};
```

> **Why `ssr = false`?** Replicate uses WASM SQLite via OPFS which only runs in the browser. Disabling SSR for the authenticated routes ensures the entire app shell is client-rendered, which also enables offline hard-refresh (the service worker serves the cached shell).

> **Why the auth gate is in `+layout.ts` and not `$effect`?** SvelteKit `load` functions are the idiomatic place for data fetching, guards, and redirects. Using `$effect` + `goto()` for redirects is a React pattern — Svelte 5 docs explicitly warn against updating state in effects. The `load` function runs before the component renders, so there's no flash of unauthenticated content.

### 7.2 App layout — rendering

#### `src/routes/app/+layout.svelte`

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<nav>
	<a href={resolve('/app/flights')}>Flights</a>
	<a href={resolve('/app/aircraft')}>Aircraft</a>
</nav>
{@render children()}
```

> **Note:** Use `resolve()` from `$app/paths` for href links — the `svelte/no-navigation-without-resolve` eslint rule enforces this so base paths are handled correctly.

### Key design decisions

- Auth gate is in the `load` function, not a Svelte `$effect` — idiomatic SvelteKit pattern
- Auth state comes from server-provided `$page.data.user` (via `+layout.server.ts` at the root), NOT a client-side Logto SDK
- `localStorage` cache provides offline resilience — if the server can't be reached, the cached user keeps the UI functional
- Replicate collection init will be added here once collections are built (future step)

---

## 8. Basic Flight Logbook UI

> **Context:** Steps 1–7 are complete. The app shell is in place with auth, offline resilience, and collection initialization. This step builds the actual flight log page to prove the full stack works end-to-end.

### 8.1 Time utilities

#### `src/lib/utils/time.ts`

```typescript
// --- Duration display (integer minutes → human-readable) ---

export function minutesToDecimal(minutes: number): string {
	return (minutes / 60).toFixed(1);
}

export function minutesToHMM(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}:${m.toString().padStart(2, '0')}`;
}

export function decimalToMinutes(decimal: number): number {
	return Math.round(decimal * 60);
}

// --- OOOI time parsing (Zulu HHMM input → ISO 8601 string) ---

// Parse "2350" into { hours: 23, minutes: 50 }. Returns null if invalid.
export function parseZuluInput(input: string): { hours: number; minutes: number } | null {
	const cleaned = input.replace(':', '').padStart(4, '0');
	if (!/^\d{4}$/.test(cleaned)) return null;
	const hours = parseInt(cleaned.slice(0, 2), 10);
	const minutes = parseInt(cleaned.slice(2), 10);
	if (hours > 23 || minutes > 59) return null;
	return { hours, minutes };
}

// Resolve an OOOI time input to an ISO 8601 UTC string.
// flightDate: "2024-03-15", input: "2350", prev: previous OOOI ISO string (or null for OUT)
export function resolveOoiTime(
	flightDate: string,
	input: string,
	prev: string | null
): string | null {
	const parsed = parseZuluInput(input);
	if (!parsed) return null;

	const date = Temporal.PlainDate.from(flightDate);
	const time = Temporal.PlainTime.from({
		hour: parsed.hours,
		minute: parsed.minutes
	});
	let dt = date.toPlainDateTime(time).toZonedDateTime('UTC');

	// If we have a previous time and this one isn't after it, we crossed midnight
	if (prev) {
		const prevInstant = Temporal.Instant.from(prev);
		if (Temporal.Instant.compare(dt.toInstant(), prevInstant) <= 0) {
			dt = dt.add({ days: 1 });
		}
	}

	return dt.toInstant().toString(); // "2024-03-15T23:50:00Z"
}

// Extract "HH:MM" Zulu from an ISO 8601 string
export function isoToZulu(iso: string): string {
	return iso.slice(11, 16);
}

// Compute duration between two ISO 8601 strings in integer minutes
export function durationMinutes(start: string, end: string): number {
	const duration = Temporal.Instant.from(end).since(Temporal.Instant.from(start));
	return Math.round(duration.total('minutes'));
}
```

### 8.2 Flights page — `src/routes/(app)/flights/+page.svelte`

Build a minimal flight log page:

1. **Get the flights collection** — already initialized by the layout
2. **Set up a reactive query** — use the collection's query API to get flights sorted by date
3. **Build a simple form** with: date, departure airport, arrival airport, aircraft, OOOI times (4-digit Zulu input fields), total time (minutes), landings
4. **On submit:** Parse OOOI inputs via `resolveOoiTime()` (from `$lib/utils/time`), compute block time if all 4 OOOI times are present, then call `collection.insert()`:
   ```typescript
   const timeOut = resolveOoiTime(flightDate, outInput, null);
   const timeOff = resolveOoiTime(flightDate, offInput, timeOut);
   const timeOn = resolveOoiTime(flightDate, onInput, timeOff);
   const timeIn = resolveOoiTime(flightDate, inInput, timeOn);

   flights.get().insert({
       id: crypto.randomUUID(),
       user_id: user.sub,
       flight_date: '2024-03-15',
       time_out: timeOut,
       time_off: timeOff,
       time_on: timeOn,
       time_in: timeIn,
       total_time: timeOut && timeIn ? durationMinutes(timeOut, timeIn) : 138,
       landings: [{ landing_type: 'day', count: 1 }],
       // ... other fields
   });
   ```
5. **Display flights** in a table with date, from, to, total time (formatted), and a delete button
6. **Delete** calls `collection.delete(id)` — landings/approaches are embedded, so they're deleted with the flight automatically

### Key things to verify once built

- Adding a flight shows it **immediately** (optimistic local write to SQLite)
- It **persists after refresh** (Replicate SQLite via OPFS)
- When online, it **syncs to Convex** (check via Convex Dashboard → Data)
- Opening in a second browser tab shows the flight **in real-time** (Convex reactivity)

> **The Replicate + TanStack DB Svelte query API may differ from the examples above.** Check the Replicate client docs for the exact reactive query pattern at implementation time.

---

## 9. PWA Setup (Service Worker & Manifest)

> **Context:** Steps 1–8 are complete. The app is fully functional online with auth, sync, and a working flight log UI. This step adds PWA support so the app shell loads offline (Replicate already handles offline data).

### 9.1 Web app manifest

Create `static/manifest.json`:

```json
{
	"name": "Flight Logbook",
	"short_name": "Logbook",
	"start_url": "/app/flights",
	"display": "standalone",
	"background_color": "#ffffff",
	"theme_color": "#1a1a2e",
	"icons": [
		{
			"src": "/icon-192.png",
			"sizes": "192x192",
			"type": "image/png"
		},
		{
			"src": "/icon-512.png",
			"sizes": "512x512",
			"type": "image/png"
		}
	]
}
```

### 9.2 Add manifest to app.html

Add to the `<head>` section of `src/app.html`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a1a2e" />
```

### 9.3 Service worker

Create `src/service-worker.ts`:

1. **On install:** cache all build assets and static files
2. **On activate:** clean up old caches
3. **On fetch:**
   - Skip non-GET requests
   - Skip requests to the Convex backend URL (Convex handles its own sync via WebSocket)
   - Skip requests to Logto endpoints
   - Navigation requests: network-first, fallback to cached app shell
   - Static assets: cache-first
   - Everything else: network-first with cache fallback

> **Critical:** The service worker must NOT cache Convex traffic (self-hosted backend URLs) or Logto auth endpoints. Replicate manages its own data sync. The service worker only caches the app shell (HTML/CSS/JS).

> **Docs:** https://svelte.dev/docs/kit/service-workers

---

## 10. Testing the Offline Flow

> **Context:** Steps 1–9 are complete. The app has auth, sync, UI, and PWA support.

### Start everything

```bash
# Terminal 1: Convex self-hosted backend (if not already running)
# Start your self-hosted Convex instance (Docker or binary) on port 3210

# Terminal 2: Logto (if not already running)
docker compose up -d  # in your logto directory

# Terminal 3: Convex dev server (auto-deploys functions to self-hosted)
npx convex dev --url http://127.0.0.1:3210 --admin-key <your-admin-key>

# Terminal 4: SvelteKit dev server
bun run dev
```

> **Note:** Both Convex and Logto run locally (self-hosted). Convex backend on port 3210, dashboard on port 3211, Logto on port 3001.

### Test sequence

1. **Open `http://localhost:5173`** — see landing page with "Sign In"
2. **Sign in** — redirects to Logto, sign in, redirected back
3. **Navigate to `/app/flights`** — empty flight list
4. **Add a flight** — fill form, submit. Flight appears immediately.
5. **Check Convex Dashboard** — go to `http://127.0.0.1:3211` (self-hosted dashboard) → Data → flights table. The flight should be there.
6. **Test offline reads:** DevTools → Network → Offline. Refresh. App loads (service worker), flights show (Replicate SQLite).
7. **Test offline writes:** While offline, add another flight. It appears in the UI. Go back online. Check the self-hosted Convex dashboard — synced within seconds.
8. **Test hard refresh offline:** Offline → Ctrl+Shift+R. App loads. Flights show.

> **The service worker only works in production builds:**
> ```bash
> bun run build
> bun run preview
> ```
> Test offline in the preview server. The dev server does NOT register the service worker.

---

## 11. Deploying to Production

> **Context:** Steps 1–10 are complete. The app works locally with offline support.

### 11.1 Convex production deployment (self-hosted)

Deploy your self-hosted Convex instance on your production server (e.g., via Docker on Coolify). Then deploy functions:

```bash
npx convex deploy --url https://convex.yourdomain.com --admin-key <your-prod-admin-key>
```

### 11.2 Logto on Coolify (production)

1. Create a **Traditional Web Application** in your production Logto instance
2. Set redirect URIs to your production domain (`https://logbook.yourdomain.com/callback`)
3. Set post sign-out redirect URI to `https://logbook.yourdomain.com/`
4. Copy the App ID

### 11.3 Set Convex production environment variables

In production, both Logto and Convex have real hostnames — no Docker networking issues. `auth.config.ts` derives the JWKS URL from `LOGTO_ENDPOINT` automatically (no `LOGTO_JWKS_URL` needed):

```bash
npx convex env set LOGTO_ENDPOINT https://auth.yourdomain.com --url https://convex.yourdomain.com --admin-key <your-prod-admin-key>
npx convex env set LOGTO_API_IDENTIFIER https://honu-log-api.dev --url https://convex.yourdomain.com --admin-key <your-prod-admin-key>
# No LOGTO_JWKS_URL needed — auth.config.ts falls back to LOGTO_ENDPOINT + '/oidc/jwks'
```

### 11.4 Set SvelteKit environment variables in Coolify

These go in your Coolify app's environment settings (or a `.env` file on the server):

```bash
# SvelteKit server-side (Logto OAuth flow)
LOGTO_ENDPOINT=https://auth.yourdomain.com
LOGTO_APP_ID=your-prod-app-id
LOGTO_APP_SECRET=your-prod-app-secret
LOGTO_COOKIE_ENCRYPTION_KEY=<random-32-char-string>
LOGTO_API_IDENTIFIER=https://honu-log-api.dev

# Public (exposed to browser)
PUBLIC_CONVEX_URL=https://convex.yourdomain.com
PUBLIC_LOGTO_API_IDENTIFIER=https://honu-log-api.dev
PUBLIC_CONVEX_SITE_URL=https://convex-site.yourdomain.com

# Convex CLI (only needed if deploying from this server)
CONVEX_SELF_HOSTED_URL=https://convex.yourdomain.com
CONVEX_SELF_HOSTED_ADMIN_KEY=<your-prod-admin-key>
```

#### Local dev vs production env var summary

| Where | Local Dev | Production |
|-------|-----------|------------|
| **`.env.local`** (SvelteKit) | `LOGTO_ENDPOINT=http://localhost:3001` | `LOGTO_ENDPOINT=https://auth.yourdomain.com` |
| **`.env.local`** (SvelteKit) | `PUBLIC_CONVEX_URL=http://127.0.0.1:3210` | `PUBLIC_CONVEX_URL=https://convex.yourdomain.com` |
| **Convex env** (`npx convex env set`) | `LOGTO_ENDPOINT=http://localhost:3001` | `LOGTO_ENDPOINT=https://auth.yourdomain.com` |
| **Convex env** | `LOGTO_API_IDENTIFIER=https://honu-log-api.dev` | `LOGTO_API_IDENTIFIER=https://honu-log-api.dev` (same) |
| **Convex env** | `LOGTO_JWKS_URL=http://host.docker.internal:3001/oidc/jwks` | *(not set — derived from LOGTO_ENDPOINT)* |

### 11.5 Deploy SvelteKit to Coolify

Push to main — Coolify auto-deploys.

> **Note:** The SvelteKit app is essentially a static shell in production. All data comes from the self-hosted Convex instance. The server only needs to serve HTML/CSS/JS and handle the Logto redirect. Both Convex and Logto are self-hosted — no cloud dependencies.

---

## Appendix: Common Issues & Gotchas

### Convex auth rejects Logto tokens

- You must use `customJwt` type (not standard OIDC) with Logto access tokens — see [this confirmed setup](https://github.com/get-convex/convex-backend/issues/75#issuecomment-2918783173)
- Logto must use **RSA private keys** (not EC) — for self-hosted, restart Docker after changing
- Decode the JWT at jwt.io — verify `iss` matches your `auth.config.ts` `issuer` exactly and `aud` matches `applicationID`
- Logto's OIDC issuer URL is typically `https://your-logto-domain/oidc` (note the `/oidc` suffix)
- The `applicationID` must be the **API Resource identifier** (e.g., `https://honu-log-api.dev`), NOT the Logto App ID
- **Docker networking:** The self-hosted Convex backend runs in Docker. `localhost` inside the container doesn't reach your host machine where Logto runs. Use `host.docker.internal` for the JWKS URL in local dev. See [Docker networking note](#docker-networking-local-dev-only).
- Verify JWKS reachability from the Convex container: `docker exec <container> sh -c "curl -s http://host.docker.internal:3001/oidc/jwks"`
- The `issuer` in `auth.config.ts` must match the JWT's `iss` claim exactly (e.g., `http://localhost:3001/oidc`), but the `jwks` URL must be reachable from the Convex backend (e.g., `http://host.docker.internal:3001/oidc/jwks`)

### Replicate collections fail to initialize

- Ensure `npx convex dev --url ... --admin-key ...` is running and functions are deployed to the self-hosted instance
- Check browser console for WebSocket errors
- Verify the Convex client has the auth token set

### WASM/Worker errors in dev

- Replicate's SQLite persistence uses OPFS via a web worker
- You may need Vite config adjustments for the worker import:
  ```typescript
  // vite.config.ts
  optimizeDeps: {
      exclude: ['@trestleinc/replicate']
  }
  ```
- Check Replicate docs for current Vite configuration requirements

### Service worker caching stale app

- During development, use DevTools → Application → Service Workers → "Update on reload"
- Or unregister the service worker when iterating

### Convex function limits

- Queries and mutations should complete quickly and touch fewer than a few hundred documents
- For bulk imports (e.g., importing your 2,400 flight history), use batch processing: import in chunks of 50-100 flights per mutation, scheduled sequentially
- Convex mutations are fully transactional — if one write in a batch fails, the whole mutation rolls back
- Self-hosted Convex may have different resource limits than cloud — check your instance configuration

### Offline-first with Logto tokens

- Logto tokens expire. When the user comes back online after being offline, the token may be expired.
- The `@logto/sveltekit` server-side SDK handles token refresh automatically using the refresh token stored in the encrypted session cookie.
- The client fetches fresh tokens via `/api/convex-token` — the server transparently refreshes if needed.
- If the session cookie expires or the refresh token is revoked, the user will need to sign in again. The cached user in `localStorage` keeps the UI working, but Convex sync won't resume until re-authenticated.

