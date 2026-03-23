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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, complete ALL steps below.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Commit all changes:**
   ```bash
   bd dolt push
   git add <files>
   git commit -m "..."
   ```
5. **Hand off** - Provide context for next session, remind user to push

**CRITICAL RULES:**

- Do NOT run `git push` — the user controls when code goes to the remote
- Commit all work locally so nothing is lost
- `bd dolt push` (beads sync) is fine — only `git push` is off-limits
<!-- END BEADS INTEGRATION -->
