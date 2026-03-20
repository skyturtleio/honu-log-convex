## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Add-ons**: prettier, eslint, sveltekit-adapter, mcp

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

---

## Ralph Workflow (PRD-driven development)

This project uses a PRD-driven "Ralph Wiggum" workflow for incremental implementation.

### How it works

1. **Read `PRD.json`** at the start of each session. It contains a flat list of features, each with `{description, acceptanceCriteria, passes}`.
2. **Pick the next feature** where `passes: false`. Features are ordered foundational → dependent, so work top-to-bottom.
3. **Read `IMPLEMENTATION_GUIDE_CONVEX.md`** for architecture context and code examples. Adapt to actual package APIs (the guide's code samples may not match bleeding-edge Replicate/convex-svelte APIs exactly).
4. **Implement the feature.** Write code, run tests if applicable.
5. **Verify all acceptance criteria** for that feature are met.
6. **Update `PRD.json`** — set `passes: true` for the completed feature.
7. **Append a line to `progress.txt`** with the date, feature description, and any deviations from the guide.
8. **Commit** with a message like: `feat: <feature description>`
9. **Stop.** One feature per session. The next session picks up the next `passes: false` feature.

### Key rules

- **One feature per commit.** Small, discrete, independently verifiable.
- **Auth is `@logto/sveltekit` (server-side).** The guide has been corrected. Do NOT use `@logto/browser`.
- **Replicate APIs are bleeding-edge.** Acceptance criteria are behavioral, not API-specific. If the Replicate API differs from the guide's examples, adapt accordingly.
- **Read the guide for context, not as gospel.** The guide provides architecture and intent. Actual package docs take precedence for API specifics.
