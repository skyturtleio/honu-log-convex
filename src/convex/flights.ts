import { replicate } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import { ownerIsolatedHooks } from './model/replicateAuth';
import type { Flight } from './types';

const r = replicate(components.replicate);

const _flights = r<Flight>({
	collection: 'flights',
	hooks: ownerIsolatedHooks('flights', 'flight')
});

export const { stream, material, recovery, insert, update, remove, mark, compact } = _flights;
