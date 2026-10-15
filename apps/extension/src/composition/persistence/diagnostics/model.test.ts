import { expect, it } from 'vitest';
import { appendRuntimeLog, parseRuntimeLog, parseRuntimeLogEntry, runtimeLogJsonl } from './model';
const row = {
  schemaVersion: 1,
  time: '2026-10-08T12:00:00.000Z',
  lastTime: '2026-10-08T12:00:00.000Z',
  source: 'Capture',
  context: 'background',
  level: 'debug',
  message: 'Ready',
  repeats: 1,
  dropped: 0,
};
it('reconstructs bounded summaries without attached content and exports canonical JSONL', () => {
  const entry = parseRuntimeLogEntry({ ...row, payload: { text: 'private' }, html: 'private' })!;
  expect(runtimeLogJsonl([entry])).not.toContain('private');
  expect(JSON.parse(runtimeLogJsonl([entry]))).toEqual(entry);
  expect(runtimeLogJsonl([])).toBe('');
});
it.each([
  null,
  {},
  { ...row, level: 'unknown' },
  { ...row, message: 'x'.repeat(1001) },
  { ...row, source: 'x'.repeat(121) },
  { ...row, context: 'x'.repeat(81) },
  { ...row, repeats: 0 },
  { ...row, dropped: -1 },
  { ...row, time: 'bad' },
  { ...row, lastTime: '2020-01-01T00:00:00.000Z' },
])('rejects malformed persisted input %j', (raw) => {
  expect(parseRuntimeLogEntry(raw)).toBeNull();
});
it('coalesces repeated summaries and evicts oldest rows by bytes and count', () => {
  const entry = parseRuntimeLogEntry(row)!;
  const repeated = appendRuntimeLog([entry], [entry]);
  expect(repeated[0]?.repeats).toBe(2);
  const many = Array.from({ length: 600 }, (_, i) => ({
    ...entry,
    message: String(i) + 'x'.repeat(999),
  }));
  const entries = appendRuntimeLog([], many);
  expect(entries.length).toBeLessThanOrEqual(512);
  expect(
    new TextEncoder().encode(JSON.stringify({ version: 1, entries })).byteLength
  ).toBeLessThanOrEqual(256 * 1024);
});
it('rejects malformed envelopes and discards invalid entries', () => {
  expect(parseRuntimeLog(null)).toEqual([]);
  expect(parseRuntimeLog({ version: 2, entries: [] })).toEqual([]);
  expect(parseRuntimeLog({ version: 1, entries: Array(513).fill(row) })).toEqual([]);
  expect(parseRuntimeLog({ version: 1, entries: [null, row] })).toHaveLength(1);
});
