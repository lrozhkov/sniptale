import { expect, it } from 'vitest';
import { parseDiagnosticLogEvent } from './diagnostics';
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
