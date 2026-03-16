# Flight Logbook — Convex Implementation Guide

> **Purpose:** Take a basic SvelteKit scaffolded app to a fully working offline-first flight logbook using Convex as the backend. This guide is intended to be followed step-by-step by a developer (with AI assistance).

> **Starting point:** A new SvelteKit app created with `npx sv create`, with nothing else wired up.

> **End state:** A working flight logbook app with auth (self-hosted Logto), offline reads/writes (Convex + Replicate), and a PWA shell.

> **Philosophy:** Fully embrace Convex and its best practices. Convex is the database, the server, and the sync engine. No Postgres, no Drizzle, no PowerSync, no hand-rolled API endpoints. The write path that took 14 files in the Postgres architecture is replaced by Convex mutations. Offline sync that required PowerSync + TanStack DB + a connector is replaced by Replicate.

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
| 1 | 1–3 | Environment, deps, Convex schema | |
| 2 | 4 | Auth (Logto + Convex OIDC) | |
| 3 | 5–6 | Replicate server functions + client collections | |
| 4 | 7 | App layout + offline auth resilience | |
| 5 | 8 | Flight logbook UI | |
| 6 | 9 | PWA (service worker + manifest) | |
| 7 | 10–11 | Testing + deploy prep | |

---

## Table of Contents

1. [Environment & Prerequisites](#1-environment--prerequisites)
2. [Project Setup & Dependencies](#2-project-setup--dependencies)
3. [Convex Schema](#3-convex-schema)
4. [Auth Integration (Logto + Convex)](#4-auth-integration-logto--convex)
5. [Replicate Server Functions](#5-replicate-server-functions)
6. [Replicate Client Collections](#6-replicate-client-collections)
7. [App Layout & Offline Auth Resilience](#7-app-layout--offline-auth-resilience)
8. [Basic Flight Logbook UI](#8-basic-flight-logbook-ui)
9. [PWA Setup (Service Worker & Manifest)](#9-pwa-setup-service-worker--manifest)
10. [Testing the Offline Flow](#10-testing-the-offline-flow)
11. [Deploying to Production](#11-deploying-to-production)

---

## Architecture Overview

### What Convex replaces

| Postgres + PowerSync stack | Convex stack |
|---------------------------|-------------|
| Postgres.app (database) | Convex cloud (database) |
| Drizzle ORM (schema + queries) | Convex schema + functions |
| `drizzle-kit` (migrations) | Convex automatic schema enforcement |
| PowerSync Docker (sync engine) | Replicate (sync engine) |
| PowerSync client schema | Replicate schema (shared server + client) |
| PowerSync connector (`uploadData`) | Replicate handles sync automatically |
| 14 SvelteKit API endpoint files | Convex mutations (one per table) |
| TanStack DB collections | Replicate collections |

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
│  Convex Cloud      │                             │
│                    ↕                             │
│  replicate mutation ←→ Convex Database           │
│                         (documents + CRDT state) │
│                                                  │
│  Auth: validates Logto JWTs via OIDC             │
└──────────────────────────────────────────────────┘
```

**Write path:** UI → collection.insert() → instant SQLite write → debounced Convex `replicate` mutation → Convex DB. If the server rejects (e.g., auth failure), the local write rolls back automatically.

**Read path:** UI → collection.query() → instant SQLite read (works offline).

**Sync path:** Convex pushes CRDT deltas via subscription → client applies to SQLite.

---

## 1. Environment & Prerequisites

> **Context:** Starting from scratch. This step sets up everything you need before writing code.

### What you need running

- **Logto** — self-hosted on Coolify (production) or in Docker locally (development). Port 3001 for local dev.
- **Docker Desktop** — only for running Logto locally. Convex runs in the cloud, no local Docker needed.
- **bun** — package manager
- **Node.js 18+** — for Convex CLI

### What you DON'T need (compared to the Postgres guide)

- ~~Postgres.app~~ — Convex is the database
- ~~`wal_level = logical`~~ — no Postgres replication to configure
- ~~PowerSync Docker container~~ — Replicate handles sync
- ~~Separate bucket storage Postgres~~ — Convex manages its own state

### Create a Convex account

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev) and sign up
2. You'll create the actual project in step 2 when you run `npx convex dev`

### Set up Logto locally (if not already running)

Same as the Postgres guide — run Logto in Docker on port 3001. Create a **Single Page Application** (not Traditional Web — since the app routes are CSR):

1. Open Logto Console at `http://localhost:3001`
2. Create a new **Single Page Application**
3. Set redirect URI to `http://localhost:5173/callback`
4. Set post sign-out redirect URI to `http://localhost:5173/`
5. Copy the App ID (you'll need it later)
6. **Create an API Resource** with identifier matching your Convex deployment URL (you'll get this in step 2)

> **Note:** We use a Single Page Application type instead of Traditional Web because the authenticated app routes run with `ssr = false`. The Logto browser SDK handles the redirect flow client-side.

---

## 2. Project Setup & Dependencies

> **Context:** Step 1 is complete. Logto is running, Convex account exists. This step scaffolds the SvelteKit project, installs dependencies, and initializes Convex.

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

# Logto browser SDK (client-side auth)
bun add @logto/browser
```

> **Note:** No `drizzle-orm`, `postgres`, `@powersync/web`, `@journeyapps/wa-sqlite`, or `@tanstack/*` packages. Replicate bundles TanStack DB internally. The entire server-side data layer is Convex.

### 2.3 Configure Convex for SvelteKit

SvelteKit doesn't like referencing code outside `src/`. Create `convex.json` in project root:

```json
{
  "functions": "src/convex/"
}
```

### 2.4 Initialize Convex

```bash
npx convex dev
```

This will:
- Authenticate with your Convex account
- Create a new project (name it `honu-log`)
- Generate a `.env.local` file with `PUBLIC_CONVEX_URL`
- Start watching for changes and pushing to the cloud

> **Keep `npx convex dev` running** in a terminal during development. It auto-deploys your schema and functions on every save.

### 2.5 Environment variables

Your `.env.local` (created by `npx convex dev`, already in `.gitignore`):

```bash
# Convex (auto-generated)
PUBLIC_CONVEX_URL=https://your-project-123.convex.cloud

# Logto (local Docker)
PUBLIC_LOGTO_ENDPOINT=http://localhost:3001
PUBLIC_LOGTO_APP_ID=<your-logto-spa-app-id>
PUBLIC_LOGTO_API_IDENTIFIER=https://honu-log-api.dev
```

Set the Logto config as Convex environment variables (via dashboard or CLI):

```bash
npx convex env set LOGTO_ENDPOINT http://localhost:3001
npx convex env set LOGTO_API_IDENTIFIER https://honu-log-api.dev
```

---

## 3. Convex Schema

> **Context:** Steps 1–2 are complete. SvelteKit project exists, Convex is initialized, dependencies installed. This step defines the database schema — the single source of truth for all flight data.

### Entity relationship overview

Same domain model as the Postgres version, but junction tables are embedded as arrays in the flights document:

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
│  date, OOOI times, time categories │
│  landings: [{ type, count }]       │  ← embedded, not junction table
│  approaches: [{ type, rwy, ... }]  │  ← embedded, not junction table
└───────────────────────────────────┘
```

### Why embed landings and approaches

In the Postgres schema, `flight_landings` and `flight_approaches` are separate junction tables. In Convex, they're embedded arrays in the flight document because:

- They're always read/written in the context of a flight — never queried independently
- Deleting a flight automatically deletes its landings/approaches (no cascade logic needed)
- One read gets the full flight record (no joins, fewer function calls, lower Convex billing)
- The arrays are tiny (1–3 landings, 0–2 approaches per flight)
- For aggregates ("total night landings this year"), query flights by date range and sum the embedded arrays

### 3.1 Replicate schema definitions

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
		flight_date: v.string(), // "2024-03-15" (ISO date string)
		flight_number: v.optional(v.string()),
		departure_airport_id: v.optional(v.string()),
		arrival_airport_id: v.optional(v.string()),

		// OOOI Times — text "HH:MM" in UTC
		time_out: v.optional(v.string()),
		time_off: v.optional(v.string()),
		time_on: v.optional(v.string()),
		time_in: v.optional(v.string()),

		// Duration fields — integer MINUTES
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

		// Embedded junction data (replaces separate tables)
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

### 3.2 Convex schema (wire it up)

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

### 3.3 Register Replicate component

#### `src/convex/convex.config.ts`

```typescript
import { defineApp } from 'convex/server';
import replicate from '@trestleinc/replicate/component';

const app = defineApp();
app.use(replicate);
export default app;
```

### Design notes

- **4 tables instead of 6** — landings and approaches are embedded in flights, eliminating 2 junction tables, their indexes, and all the cascade/ownership logic.
- **`id` is a string field on the shape** — Replicate uses this as the client-side document key (`crypto.randomUUID()`). Convex also assigns its own `_id` internally.
- **Foreign keys are strings** — Convex `v.id("table")` validates at write time, but Replicate schemas use `v.string()` for cross-table references since the client generates IDs offline.
- **`user_id` is the Logto `sub` claim** — same as the Postgres version. Every query filters by it.
- **Duration fields are integer minutes** — same convention. Convert for display only.
- **OOOI times are text "HH:MM" in UTC** — same convention.
- **Defaults are declared in the schema** — Replicate applies these on insert, replacing the `DEFAULT` clauses from Drizzle/Postgres.
- **No `created_at`/`updated_at`** — Convex provides `_creationTime` automatically. Replicate tracks `timestamp` internally for sync ordering. If you need `updated_at` for display, add it to the shape and set it in your mutation logic.

---

## 4. Auth Integration (Logto + Convex)

> **Context:** Steps 1–3 are complete. Convex schema is defined with 4 tables. Replicate component is registered. This step wires up authentication so users can sign in via Logto and Convex functions can verify their identity.

### Architecture

```
Browser                          Logto                    Convex
  │                                │                        │
  │──── redirect to /authorize ───>│                        │
  │<─── redirect with auth code ───│                        │
  │──── exchange for access token ─>│                        │
  │<─── access token (JWT) ────────│                        │
  │                                                         │
  │──── WebSocket + access token ──────────────────────────>│
  │                                                         │── verify JWT
  │                                                         │   via Logto JWKS
  │<─── authenticated connection ──────────────────────────│
```

The Logto browser SDK handles the OAuth redirect flow. An **access token** (not ID token) is passed to the Convex client. Convex verifies it via Logto's JWKS endpoint using the `customJwt` provider type.

> **Proven working:** This configuration comes from [a confirmed working setup](https://github.com/get-convex/convex-backend/issues/75#issuecomment-2918783173) of SvelteKit + Logto + Convex. The key insight is using `customJwt` with Logto's access token (not the standard OIDC ID token flow), which also gives you Logto's scopes/permissions in Convex functions.

### 4.1 Logto setup for Convex

In Logto Console:

1. **Use RSA algorithm for private keys** — for self-hosted Logto, check your private key config and restart the Docker service after changing
2. **Create an API Resource** with an identifier like `https://honu-log-api.dev` (this becomes the `applicationID` in Convex and the `audience` when requesting tokens)
3. **Create permissions (scopes)** and user roles if needed (optional for MVP — useful later for admin features)
4. **(Optional) Customize access token claims** — add user email/name so Convex functions can access them without a separate lookup. In Logto Console → JWT Customization:

```javascript
const getCustomJwtClaims = async ({ token, context, environmentVariables, api }) => {
	return {
		email: context.user.primaryEmail,
		username: context.user.username
	};
};
```

### 4.2 Convex auth config

#### `src/convex/auth.config.ts`

```typescript
export default {
	providers: [
		{
			type: 'customJwt',
			// The API Identifier from your Logto API Resource
			applicationID: process.env.LOGTO_API_IDENTIFIER!,
			// Logto OIDC issuer endpoint
			issuer: process.env.LOGTO_ENDPOINT + '/oidc',
			// Logto JWKS endpoint for token verification
			jwks: process.env.LOGTO_ENDPOINT + '/oidc/jwks',
			// Must match Logto's signing algorithm (RSA)
			algorithm: 'RS256'
		}
	]
};
```

Set the environment variables via Convex CLI:

```bash
npx convex env set LOGTO_ENDPOINT http://localhost:3001
npx convex env set LOGTO_API_IDENTIFIER https://honu-log-api.dev
```

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

### 4.3 Auth helper (server-side)

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

### 4.3 Logto client-side integration

#### `src/lib/auth.ts`

```typescript
import LogtoClient from '@logto/browser';
import {
	PUBLIC_LOGTO_ENDPOINT,
	PUBLIC_LOGTO_APP_ID,
	PUBLIC_LOGTO_API_IDENTIFIER
} from '$env/static/public';

let client: LogtoClient | null = null;

export function getLogtoClient() {
	if (!client) {
		client = new LogtoClient({
			endpoint: PUBLIC_LOGTO_ENDPOINT,
			appId: PUBLIC_LOGTO_APP_ID,
			// Request access tokens scoped to the Convex API resource
			resources: [PUBLIC_LOGTO_API_IDENTIFIER]
		});
	}
	return client;
}

// Fetch access token for Convex (not ID token)
export async function getConvexToken() {
	const logto = getLogtoClient();
	return logto.getAccessToken(PUBLIC_LOGTO_API_IDENTIFIER);
}
```

### 4.4 Callback route

#### `src/routes/callback/+page.svelte`

```svelte
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getLogtoClient } from '$lib/auth';

	onMount(async () => {
		const logto = getLogtoClient();
		await logto.handleSignInCallback(window.location.href);
		goto('/app/flights');
	});
</script>

<p>Signing in...</p>
```

### 4.5 Landing page

#### `src/routes/+page.svelte`

```svelte
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getLogtoClient } from '$lib/auth';

	let authenticated = $state(false);
	let loading = $state(true);

	onMount(async () => {
		const logto = getLogtoClient();
		authenticated = await logto.isAuthenticated();
		loading = false;
	});

	async function signIn() {
		const logto = getLogtoClient();
		await logto.signIn('http://localhost:5173/callback');
	}

	async function signOut() {
		const logto = getLogtoClient();
		await logto.signOut('http://localhost:5173/');
	}
</script>

{#if loading}
	<p>Loading...</p>
{:else if authenticated}
	<p>Welcome back!</p>
	<a href="/app/flights">Go to Logbook</a>
	<button onclick={signOut}>Sign Out</button>
{:else}
	<h1>Flight Logbook</h1>
	<p>Sign in to start logging flights.</p>
	<button onclick={signIn}>Sign In</button>
{/if}
```

### 4.6 Convex provider with auth

#### `src/routes/+layout.svelte`

Wire up the Convex client with Logto token fetching:

```svelte
<script>
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from 'convex-svelte';
	import { getLogtoClient } from '$lib/auth';

	const { children } = $props();

	// setupConvex with auth token provider
	// Check convex-svelte docs for the auth integration API —
	// you need to pass a fetchAccessToken function that returns
	// the Logto access token for Convex to verify.
	setupConvex(PUBLIC_CONVEX_URL);
</script>

{@render children()}
```

> **Implementation note:** The exact API for passing auth tokens to `convex-svelte` may differ from React's `ConvexProviderWithAuth`. Check the `convex-svelte` package docs at implementation time. The key requirement: provide a `fetchAccessToken` callback that calls `getConvexToken()` (from `$lib/auth`) and returns the access token string. This is the access token scoped to your Logto API Resource, NOT the ID token.

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

> **This is the most important security boundary.** In the Postgres guide, every API endpoint manually checked `user_id`. Here, the authorization logic is centralized in one place per collection. If Replicate doesn't support authorization hooks directly, wrap the generated functions with auth checks.

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
  +page.svelte              ← Public landing/login page — done in step 4
  +layout.svelte            ← Root layout (Convex provider) — done in step 4
  callback/
    +page.svelte            ← Logto callback — done in step 4
  (app)/                    ← Authenticated route group (SSR DISABLED)
    +layout.ts              ← ssr = false
    +layout.svelte          ← Auth gate + collection init
    flights/
      +page.svelte          ← Flight list & entry (step 8)
    aircraft/
      +page.svelte          ← Aircraft management (step 8)
```

### 7.1 App layout — SSR disabled

#### `src/routes/(app)/+layout.ts`

```typescript
export const ssr = false;
```

> **Why `ssr = false`?** Replicate uses WASM SQLite via OPFS which only runs in the browser. Disabling SSR for the authenticated routes ensures the entire app shell is client-rendered, which also enables offline hard-refresh (the service worker serves the cached shell).

### 7.2 App layout — auth gate + collection init

#### `src/routes/(app)/+layout.svelte`

```svelte
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getLogtoClient } from '$lib/auth';
	import { aircraftTypes } from '$lib/collections/aircraft_types';
	import { aircraft } from '$lib/collections/aircraft';
	import { airports } from '$lib/collections/airports';
	import { flights } from '$lib/collections/flights';

	const { children } = $props();
	let ready = $state(false);
	let user = $state<{ sub: string; name?: string; email?: string } | null>(null);

	onMount(async () => {
		const logto = getLogtoClient();
		const authenticated = await logto.isAuthenticated();

		if (!authenticated) {
			// Try cached user for offline resilience
			const cached = localStorage.getItem('honu-user');
			if (cached) {
				user = JSON.parse(cached);
			} else {
				goto('/');
				return;
			}
		} else {
			// Online: get user info and cache it
			const claims = await logto.getIdTokenClaims();
			user = { sub: claims.sub, name: claims.name, email: claims.email };
			localStorage.setItem('honu-user', JSON.stringify(user));
		}

		// Initialize Replicate collections
		try {
			await Promise.all([
				aircraftTypes.init(),
				aircraft.init(),
				airports.init(),
				flights.init()
			]);
		} catch (err) {
			console.error('Collection init failed (may be offline):', err);
			// Still show UI — collections may have cached data
		}

		ready = true;
	});
</script>

{#if !ready}
	<p>Loading...</p>
{:else if !user}
	<p>Please <a href="/">sign in</a> to continue.</p>
{:else}
	<nav>
		<a href="/app/flights">Flights</a>
		<a href="/app/aircraft">Aircraft</a>
	</nav>
	{@render children()}
{/if}
```

### Key differences from the Postgres guide

- No `+layout.server.ts` needed in `(app)/` — auth state comes from the Logto browser SDK, not SvelteKit server locals
- Collection init replaces PowerSync `getPowerSyncDb()` + connector setup
- `Promise.all` initializes all 4 collections in parallel
- Error handling on init allows the app to work with previously cached data

---

## 8. Basic Flight Logbook UI

> **Context:** Steps 1–7 are complete. The app shell is in place with auth, offline resilience, and collection initialization. This step builds the actual flight log page to prove the full stack works end-to-end.

### 8.1 Time display utilities

Same as the Postgres guide — durations are integer minutes, display as decimal hours or H:MM.

#### `src/lib/utils/time.ts`

```typescript
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
```

### 8.2 Flights page — `src/routes/(app)/flights/+page.svelte`

Build a minimal flight log page:

1. **Get the flights collection** — already initialized by the layout
2. **Set up a reactive query** — use the collection's query API to get flights sorted by date
3. **Build a simple form** with: date, departure airport, arrival airport, aircraft, OOOI times, total time (minutes), landings
4. **On submit:** call `collection.insert()` with `crypto.randomUUID()` as the id, the form data, and the authenticated user's `sub` as `user_id`. Landings go directly in the embedded array:
   ```typescript
   flights.get().insert({
       id: crypto.randomUUID(),
       user_id: user.sub,
       flight_date: '2024-03-15',
       total_time: 138,
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
   - Skip requests to `*.convex.cloud` (Convex handles its own sync via WebSocket)
   - Skip requests to Logto endpoints
   - Navigation requests: network-first, fallback to cached app shell
   - Static assets: cache-first
   - Everything else: network-first with cache fallback

> **Critical:** The service worker must NOT cache Convex traffic or Logto auth endpoints. Replicate manages its own data sync. The service worker only caches the app shell (HTML/CSS/JS).

> **Docs:** https://svelte.dev/docs/kit/service-workers

---

## 10. Testing the Offline Flow

> **Context:** Steps 1–9 are complete. The app has auth, sync, UI, and PWA support.

### Start everything

```bash
# Terminal 1: Logto (if not already running)
docker compose up -d  # in your logto directory

# Terminal 2: Convex dev server (auto-deploys functions)
npx convex dev

# Terminal 3: SvelteKit dev server
bun run dev
```

> **Note:** No PowerSync Docker to start. Convex runs in the cloud even during development.

### Test sequence

1. **Open `http://localhost:5173`** — see landing page with "Sign In"
2. **Sign in** — redirects to Logto, sign in, redirected back
3. **Navigate to `/app/flights`** — empty flight list
4. **Add a flight** — fill form, submit. Flight appears immediately.
5. **Check Convex Dashboard** — go to dashboard.convex.dev → your project → Data → flights table. The flight should be there.
6. **Test offline reads:** DevTools → Network → Offline. Refresh. App loads (service worker), flights show (Replicate SQLite).
7. **Test offline writes:** While offline, add another flight. It appears in the UI. Go back online. Check Convex Dashboard — synced within seconds.
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

### 11.1 Convex production deployment

```bash
npx convex deploy
```

This creates a production deployment separate from your dev deployment. Note the production URL.

### 11.2 Logto on Coolify (production)

1. Create a **Single Page Application** in your production Logto instance
2. Set redirect URIs to your production domain (`https://logbook.yourdomain.com/callback`)
3. Set post sign-out redirect URI to `https://logbook.yourdomain.com/`
4. Copy the App ID

### 11.3 Set Convex production environment variables

```bash
npx convex env set --prod LOGTO_ISSUER_URL https://auth.yourdomain.com/oidc
npx convex env set --prod LOGTO_APP_ID your-prod-app-id
```

### 11.4 Set SvelteKit environment variables in Coolify

```bash
PUBLIC_CONVEX_URL=https://your-production-deployment.convex.cloud
PUBLIC_LOGTO_ENDPOINT=https://auth.yourdomain.com
PUBLIC_LOGTO_APP_ID=your-prod-app-id
```

### 11.5 Deploy SvelteKit to Coolify

Push to main — Coolify auto-deploys.

> **Note:** The SvelteKit app is essentially a static shell in production. All data comes from Convex. The server only needs to serve HTML/CSS/JS and handle the Logto redirect.

---

## Appendix: Common Issues & Gotchas

### Convex auth rejects Logto tokens

- You must use `customJwt` type (not standard OIDC) with Logto access tokens — see [this confirmed setup](https://github.com/get-convex/convex-backend/issues/75#issuecomment-2918783173)
- Logto must use **RSA private keys** (not EC) — for self-hosted, restart Docker after changing
- Decode the JWT at jwt.io — verify `iss` matches your `auth.config.ts` `issuer` exactly and `aud` matches `applicationID`
- Logto's OIDC issuer URL is typically `https://your-logto-domain/oidc` (note the `/oidc` suffix)
- The `applicationID` must be the **API Resource identifier** (e.g., `https://honu-log-api.dev`), NOT the Logto App ID
- Check that the JWKS endpoint is reachable from Convex cloud: `{issuer}/jwks`

### Replicate collections fail to initialize

- Ensure `npx convex dev` is running and functions are deployed
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

- Queries and mutations should complete in under 100ms and touch fewer than a few hundred documents
- For bulk imports (e.g., importing your 2,400 flight history), use batch processing: import in chunks of 50-100 flights per mutation, scheduled sequentially
- Convex mutations are fully transactional — if one write in a batch fails, the whole mutation rolls back

### Offline-first with Logto tokens

- Logto tokens expire. When the user comes back online after being offline, the token may be expired.
- The Logto browser SDK should handle token refresh automatically if the refresh token is still valid.
- If refresh fails, the user will need to sign in again. The cached user in `localStorage` keeps the UI working, but Convex sync won't resume until re-authenticated.

---

## Appendix: What this guide eliminated

Compared to the Postgres + PowerSync implementation guide:

| Eliminated | Why |
|-----------|-----|
| Postgres.app setup + `wal_level = logical` | Convex is the database |
| `drizzle.config.ts` + `src/lib/server/db/` | No ORM needed |
| `bunx drizzle-kit generate/migrate` | Convex handles schema automatically |
| PowerSync Docker (`docker-compose.powersync.yaml`) | Replicate handles sync |
| PowerSync config (`powersync/powersync.yaml` + sync rules) | Replicate handles sync rules |
| PowerSync client schema (`src/lib/powersync/schema.ts`) | Replicate schema is shared |
| PowerSync db singleton (`src/lib/powersync/db.ts`) | Replicate manages its own db |
| PowerSync connector (`src/lib/powersync/connector.ts`) | Replicate handles upload/download |
| 14 API endpoint files (`src/routes/api/**`) | Convex mutations replace the write path |
| `flight_landings` table | Embedded in flights |
| `flight_approaches` table | Embedded in flights |
| PlanetScale Postgres (production) | Convex cloud |
| PowerSync Cloud (production) | Included in Convex |

**Net result:** ~7 sessions instead of ~12. The entire write path (step 11 in the Postgres guide — the biggest step, split across two sessions) is replaced by 4 short files in step 5.
