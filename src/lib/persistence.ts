import { browser } from '$app/environment';
import { persistence, type Persistence } from '@trestleinc/replicate/client';

// Browser-only: create IndexedDB persistence (no SQLite worker needed)
const createBrowserPersistence = () => persistence.indexeddb('honu-log');

// SSR-safe: only initialize in browser
export const createPersistence: () => Promise<Persistence> = browser
	? createBrowserPersistence
	: () => Promise.reject(new Error('Persistence is browser-only'));
