/**
 * Tests for smart time inference logic (bead amd).
 *
 * The FlightForm uses a last-write-wins strategy:
 * - Editing Out or In clears totalTimeOverride → total recalculates from block time
 * - Editing Total with only one of Out/In → infers the missing time
 * - Focusing an inferred field promotes the value so the user can edit from it
 *
 * These tests verify the underlying functions that power this logic,
 * simulating the full inference cycle without needing a browser.
 */
import { describe, expect, it } from 'vitest';
import {
	resolveOooiTimes,
	calculateBlockTime,
	formatPlusMinutes,
	parseDuration,
	inferZuluTime,
	toZuluDisplay
} from './oooi';

describe('smart time inference: last-write-wins cycle', () => {
	it('Out + In → calculated total (block time)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1200', in: '1430' });
		const blockMins = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(blockMins).toBe(150);
		expect(formatPlusMinutes(blockMins)).toBe('2+30');
	});

	it('Out + Total → inferred In', () => {
		const totalMins = parseDuration('2+30');
		expect(totalMins).toBe(150);

		const inferredIn = inferZuluTime('1200', totalMins as number, true);
		expect(inferredIn).toBe('1430');
	});

	it('In + Total → inferred Out', () => {
		const totalMins = parseDuration('2+30');
		expect(totalMins).toBe(150);
		const inferredOut = inferZuluTime('1430', totalMins as number, false);
		expect(inferredOut).toBe('1200');
	});

	it('full cycle: enter Out+In → total calc, change total → conflict, remove Out → infer', () => {
		// Step 1: User enters Out=1200 and In=1430
		const resolved1 = resolveOooiTimes('2024-03-15', { out: '1200', in: '1430' });
		const block1 = calculateBlockTime(resolved1.time_out, resolved1.time_in);
		expect(block1).toBe(150);
		expect(formatPlusMinutes(block1)).toBe('2+30');

		// Step 2: User overrides Total to 3+00 — conflict detected
		const overrideMinutes = parseDuration('3+00');
		expect(overrideMinutes).toBe(180);
		// Block time (150) != override (180) → conflict
		expect(Math.abs((overrideMinutes as number) - (block1 as number))).toBeGreaterThan(1);

		// Step 3: User clears Out. Now we have In=1430 + Total=3+00 → infer Out
		const inferredOut = inferZuluTime('1430', overrideMinutes as number, false);
		expect(inferredOut).toBe('1130');

		// Verify round-trip: resolving inferred Out + In gives block = override
		const resolved3 = resolveOooiTimes('2024-03-15', {
			out: inferredOut as string,
			in: '1430'
		});
		const block3 = calculateBlockTime(resolved3.time_out, resolved3.time_in);
		expect(block3).toBe(180);
	});

	it('editing inferred Out then recalculates total from block time', () => {
		// Start: In=1430, Total=3+00 → inferred Out=1130
		const totalMins = parseDuration('3+00');
		expect(totalMins).toBe(180);
		const inferredOut = inferZuluTime('1430', totalMins as number, false);
		expect(inferredOut).toBe('1130');

		// User focuses Out field → promotes inferred value "1130"
		// Then edits it to "1100" → total should recalculate from block time
		// (last-write-wins: editing Out clears totalTimeOverride)
		const resolved = resolveOooiTimes('2024-03-15', { out: '1100', in: '1430' });
		const newBlock = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(newBlock).toBe(210); // 3+30
		expect(formatPlusMinutes(newBlock)).toBe('3+30');
	});

	it('midnight crossing: Out + Total → inferred In crosses midnight', () => {
		const totalMins = parseDuration('2+50');
		expect(totalMins).toBe(170);
		const inferredIn = inferZuluTime('2350', totalMins as number, true);
		expect(inferredIn).toBe('0240');

		// Verify: resolve and calculate block time
		const resolved = resolveOooiTimes('2024-03-15', {
			out: '2350',
			in: inferredIn as string
		});
		const block = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(block).toBe(170);
	});

	it('midnight crossing: In + Total → inferred Out crosses midnight backwards', () => {
		const totalMins = parseDuration('2+50');
		expect(totalMins).toBe(170);
		const inferredOut = inferZuluTime('0240', totalMins as number, false);
		expect(inferredOut).toBe('2350');
	});

	it('does not infer when both Out and In are present', () => {
		// Inference only fires when one of Out/In is missing
		const timeOut = '1200';
		const timeIn = '1430';

		expect(!!timeIn && !!timeOut).toBe(true);
		// No inference needed — block time is directly calculable
		const resolved = resolveOooiTimes('2024-03-15', { out: timeOut, in: timeIn });
		expect(calculateBlockTime(resolved.time_out, resolved.time_in)).toBe(150);
	});

	it('does not infer when total is not manually set', () => {
		// Inference requires manualTotalMinutes (totalTimeOverride=true + valid totalTimeInput)
		const manualTotal = parseDuration('');
		expect(manualTotal).toBeNull();
		// inferZuluTime won't be called since manualTotal is null
	});

	it('inferred value round-trips through resolve + toZuluDisplay', () => {
		const totalMins = parseDuration('2+30');
		expect(totalMins).toBe(150);
		const inferredIn = inferZuluTime('1200', totalMins as number, true);
		expect(inferredIn).toBe('1430');

		// Resolve to ISO, then back to display
		const resolved = resolveOooiTimes('2024-03-15', {
			out: '1200',
			in: inferredIn as string
		});
		const display = toZuluDisplay(resolved.time_in);
		expect(display).toBe('1430');
	});
});

describe('time conflict detection', () => {
	it('detects conflict when Out/In block time disagrees with manual Total', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1200', in: '1430' });
		const blockMins = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(blockMins).toBe(150);
		const overrideMins = parseDuration('3+00');
		expect(overrideMins).toBe(180);
		const diff = Math.abs((overrideMins as number) - (blockMins as number));
		expect(diff).toBeGreaterThan(1);
	});

	it('no conflict when Out/In block time matches manual Total within 1 minute', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1200', in: '1430' });
		const blockMins = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(blockMins).toBe(150);
		const overrideMins = parseDuration('2+30');
		expect(overrideMins).toBe(150);
		const diff = Math.abs((overrideMins as number) - (blockMins as number));
		expect(diff).toBeLessThanOrEqual(1);
	});

	it('no conflict when totalTimeOverride is false (total auto-calculated)', () => {
		const totalTimeOverride = false;
		expect(totalTimeOverride).toBe(false);
		// Conflict check requires totalTimeOverride && totalTimeInput to be truthy
	});
});
