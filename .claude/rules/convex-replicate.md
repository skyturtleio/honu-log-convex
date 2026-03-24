---
paths: ['src/convex/**', 'src/lib/convex/**', 'src/lib/replicate/**', 'src/routes/app/**']
---

## Bleeding-edge dependencies: Convex + Replicate

Convex (self-hosted) and Replicate (`@convex-dev/replicate`) APIs change frequently. Your training data is likely outdated.

**Before writing or modifying Convex/Replicate code:**

1. Read the actual source in `node_modules/@convex-dev/replicate` — don't rely on cached knowledge
2. Check `src/convex/schema.ts` for the current schema pattern (Replicate `schema.table()` is the source of truth)
3. Check `src/convex/model/` for existing server function patterns
4. Foreign keys use `v.string()` (not `v.id()`), IDs are `crypto.randomUUID()` on the client

**Do NOT assume:**

- Replicate collection API shape — verify in node_modules
- Convex function registration patterns — read existing functions first
- Auth hook API — check current `auth.config.ts`
