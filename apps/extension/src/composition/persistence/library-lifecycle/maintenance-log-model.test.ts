import { expect, it } from 'vitest';
import {
  appendMaintenanceLog,
  createMaintenanceLogEntry,
  maintenanceLogJsonl,
  MAINTENANCE_LOG_MAX_BYTES,
  parseMaintenanceLog,
  parseMaintenanceLogEntry,
} from './maintenance-log-model';

it('reconstructs only fixed messages, codes and bounded numeric metrics', () => {
  const entry = createMaintenanceLogEntry(
    {
      operation: 'physical-delete',
      code: 'invalid',
      message: 'secret',
      counts: { retained: 2, filename: 'private.png' },
      token: 'secret',
    },
    1000
  )!;
  expect(entry.message).not.toContain('secret');
  expect(entry.counts).toEqual({ retained: 2 });
  expect(
    createMaintenanceLogEntry({ operation: 'physical-delete', code: '__proto__' }, 1000)
  ).toBeNull();
  expect(
    createMaintenanceLogEntry(
      { operation: 'physical-delete', code: 'invalid', counts: { retained: -1 } },
      1000
    )
  ).toBeNull();
  expect(parseMaintenanceLogEntry({ ...entry, repeats: 0 })).toBeNull();
  expect(parseMaintenanceLogEntry({ ...entry, lastTime: '2026-02-31T00:00:00.000Z' })).toBeNull();
});

it('evicts oldest events within both limits and merges consecutive blocked repetitions', () => {
  let entries = [] as NonNullable<ReturnType<typeof createMaintenanceLogEntry>>[];
  for (let i = 0; i < 600; i++)
    entries = appendMaintenanceLog(
      entries,
      createMaintenanceLogEntry(
        { operation: 'physical-delete', code: 'deleted', counts: { deleted: 1 } },
        i * 1000
      )!
    );
  expect(entries).toHaveLength(512);
  expect(entries[0]!.time).toBe(new Date(88000).toISOString());
  expect(
    new TextEncoder().encode(JSON.stringify({ version: 1, entries })).byteLength
  ).toBeLessThanOrEqual(MAINTENANCE_LOG_MAX_BYTES);
  const first = createMaintenanceLogEntry(
    { operation: 'physical-delete', code: 'invalid' },
    700000
  )!;
  entries = appendMaintenanceLog(entries, first);
  entries = appendMaintenanceLog(
    entries,
    createMaintenanceLogEntry({ operation: 'physical-delete', code: 'invalid' }, 701000)!
  );
  expect(entries.at(-1)).toMatchObject({
    time: first.time,
    lastTime: new Date(701000).toISOString(),
    repeats: 2,
  });
});

it('exports valid one-event-per-line JSON with UTC timestamps and no injected content', () => {
  const entry = createMaintenanceLogEntry(
    { operation: 'trash', code: 'expired', counts: { deleted: 3 } },
    1000
  )!;
  const stored = parseMaintenanceLog({
    version: 1,
    entries: [{ ...entry, message: 'private\nsecret', url: 'https://secret' }, { invalid: true }],
  });
  const text = maintenanceLogJsonl(stored);
  expect(text.endsWith('\n')).toBe(true);
  expect(text.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(text)).toMatchObject({
    time: '1970-01-01T00:00:01.000Z',
    status: 'completed',
    counts: { deleted: 3 },
    schemaVersion: 1,
  });
  expect(text).not.toMatch(/private|secret/);
});

it.each([
  null,
  {},
  { operation: 'private', code: 'invalid' },
  { operation: 'trash', code: 'private' },
  { operation: 'trash', code: 'failed', durationMs: Infinity },
  { operation: 'trash', code: 'failed', counts: null },
  { operation: 'trash', code: 'failed', counts: { failed: 'secret' } },
])('rejects malformed event input without preserving unknown values', (raw) => {
  expect(createMaintenanceLogEntry(raw, 1000)).toBeNull();
});
it.each([NaN, -1, Infinity, 253402300800000])('rejects invalid time %s', (now) => {
  expect(createMaintenanceLogEntry({ operation: 'trash', code: 'failed' }, now)).toBeNull();
});
it.each([
  null,
  {},
  { version: 2, entries: [] },
  { version: 1, entries: {} },
  { version: 1, entries: Array(513).fill({}) },
])('does not load invalid or oversized history', (raw) => {
  expect(parseMaintenanceLog(raw)).toEqual([]);
});
it('separates different reasons, metrics and old repetitions', () => {
  const first = createMaintenanceLogEntry(
    { operation: 'physical-delete', code: 'invalid', counts: { retained: 1 } },
    1000
  )!;
  for (const next of [
    createMaintenanceLogEntry(
      { operation: 'physical-delete', code: 'invalid', counts: { retained: 2 } },
      2000
    )!,
    createMaintenanceLogEntry(
      { operation: 'physical-delete', code: 'mismatch', counts: { retained: 1 } },
      2000
    )!,
    createMaintenanceLogEntry(
      { operation: 'orphans', code: 'invalid', counts: { retained: 1 } },
      2000
    )!,
    createMaintenanceLogEntry(
      { operation: 'physical-delete', code: 'invalid', counts: { retained: 1 } },
      62000
    )!,
  ])
    expect(appendMaintenanceLog([first], next)).toHaveLength(2);
  expect(maintenanceLogJsonl([])).toBe('');
});

it('distinguishes reversible draft moves from permanent Trash deletion', () => {
  const moved = createMaintenanceLogEntry(
    { operation: 'drafts', code: 'moved-to-trash', counts: { moved: 2, retained: 1 } },
    1000
  );
  expect(moved).toMatchObject({
    counts: { moved: 2, retained: 1 },
    message: 'Drafts were moved to Trash; their files were retained.',
  });
  expect(
    createMaintenanceLogEntry({ operation: 'trash', code: 'expired', counts: { deleted: 2 } }, 1000)
      ?.message
  ).toContain('deleted');
});
