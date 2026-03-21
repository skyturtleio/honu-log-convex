## Honu Log

Offline-first flight logbook PWA built with SvelteKit 5, Convex, Replicate (CRDT sync), and Logto auth.

- **Package manager**: `bun` (never `npm`)
- **Typecheck**: `bun run check`
- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Test**: `bun run test`
- **Dev server**: `bun run dev`

Auth uses `@logto/sveltekit` (server-side). Do NOT use `@logto/browser`.

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

<!-- effect-solutions:end -->
