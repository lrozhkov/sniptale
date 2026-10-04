import { expect, it } from 'vitest';
import { parseRecordingMetadata, summarizeRecordingMetadata } from './recording-metadata';

const facts = { captureMode: 'SCREEN', displaySurface: 'window', actionCount: 2, hasPointer: true };
it('retains only acquisition facts without events, coordinates or file properties', () => {
  const summary = summarizeRecordingMetadata({
    captureMode: 'SCREEN',
    displaySurface: 'window',
    actionEvents: [{ url: 'private', text: 'private' }, {}],
    cursorTrack: { samples: [{ x: 10, y: 20 }] },
  });
  expect(summary).toEqual(facts);
  expect(parseRecordingMetadata({ ...summary, url: 'private', duration: 99 })).toEqual(facts);
  expect(
    summarizeRecordingMetadata({ captureMode: null, cursorTrack: null, actionEvents: [] })
  ).toEqual({ captureMode: null, displaySurface: null, actionCount: 0, hasPointer: false });
});
it.each([
  null,
  {},
  { ...facts, actionCount: -1 },
  { ...facts, actionCount: 1.5 },
  { ...facts, actionCount: Infinity },
  { ...facts, actionCount: Number.MAX_SAFE_INTEGER + 1 },
  { ...facts, captureMode: 'unknown' },
  { ...facts, displaySurface: 'private-url' },
  { ...facts, hasPointer: 1 },
])('rejects invalid snapshots: %j', (value) => expect(parseRecordingMetadata(value)).toBeNull());
