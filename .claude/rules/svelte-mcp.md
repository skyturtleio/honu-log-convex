---
paths: ['**/*.svelte', 'src/routes/**']
---

Use the Svelte MCP server for Svelte 5 and SvelteKit documentation.

1. **list-sections** — Use FIRST to discover available documentation sections. Analyze the `use_cases` field to find relevant sections.
2. **get-documentation** — Fetch ALL sections relevant to the task.
3. **svelte-autofixer** — MUST run on any Svelte code before finalizing. Keep calling until no issues remain.
4. **playground-link** — Only offer after completing code. Never call if code was written to project files.
