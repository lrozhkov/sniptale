import { expect, it } from 'vitest';
import { parseDiagnosticLogEvent, parseSyncQueueDiagnosticHint } from './diagnostics';
const event = {
  time: '2026-10-08T12:00:00.000Z',
  source: 'Capture',
  level: 'debug',
  message: 'Ready',
};
it('admits only bounded diagnostic summaries, discarding other fields', () => {
  expect(parseDiagnosticLogEvent({ ...event, payload: 'private', context: 'spoofed' })).toEqual(
    event
  );
});
it.each([
  null,
  {},
  { ...event, time: 'invalid' },
  { ...event, source: 'x'.repeat(121) },
  { ...event, message: 'x'.repeat(1001) },
  { ...event, level: 'fatal' },
])('rejects malformed event %j', (raw) => {
  expect(parseDiagnosticLogEvent(raw)).toBeNull();
});

const hint = {
  scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 0 },
  source: { kind: 'operation', operationId: 'operation' },
};
it('admits bounded queue source hints and discards event rows and secret fields', () => {
  expect(parseSyncQueueDiagnosticHint({ ...hint, rows: ['private'], token: 'private' })).toEqual(
    hint
  );
  expect(
    parseSyncQueueDiagnosticHint({ ...hint, source: { kind: 'connection', secret: 'private' } })
  ).toEqual({
    scope: hint.scope,
    source: { kind: 'connection' },
  });
});
it.each([
  null,
  {},
  { ...hint, scope: null },
  { ...hint, source: null },
  { ...hint, scope: { ...hint.scope, spaceId: '' } },
  { ...hint, scope: { ...hint.scope, spaceId: 'x'.repeat(257) } },
  { ...hint, scope: { ...hint.scope, connectionGeneration: 0 } },
  { ...hint, scope: { ...hint.scope, connectionGeneration: 1.5 } },
  { ...hint, scope: { ...hint.scope, profileCreatedAt: -1 } },
  { ...hint, source: { kind: 'unknown' } },
  { ...hint, source: { kind: 'operation', operationId: '' } },
  { ...hint, source: { kind: 'operation', operationId: 'x'.repeat(257) } },
])('refuses malformed queue source hints %j', (raw) => {
  expect(parseSyncQueueDiagnosticHint(raw)).toBeNull();
});
