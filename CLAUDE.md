## Honu Log

Offline-first flight logbook PWA built with SvelteKit 5, Convex, Replicate (CRDT sync), and Logto auth.

- **Package manager**: `bun` (never `npm`)
- **Typecheck**: `bun run check`
- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Test**: `bun run test`
- **Dev server**: `bun run dev`

Auth uses `@logto/sveltekit` (server-side). Do NOT use `@logto/browser`.
