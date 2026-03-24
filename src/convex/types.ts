// Re-export types from Zod schemas — single source of truth.
// Schemas live in src/schemas/ (no SvelteKit imports) so Convex tsc can resolve them.
export type { Aircraft } from '../schemas/aircraft';
export type { Flight } from '../schemas/flight';
