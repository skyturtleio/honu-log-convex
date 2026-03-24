// Re-export types from Zod schemas — single source of truth.
// Server files import from here; Zod schemas in collections/ are the canonical definitions.
export type { Aircraft } from '../collections/useAircraft';
export type { Flight } from '../collections/useFlights';
