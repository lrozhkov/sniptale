import { expect, it } from 'vitest';
import type { RecordingActionEvent, RecordingTelemetrySignal } from './types';
import { normalizeRecordingActions, normalizeRecordingSignals } from './recording-actions';

const typing = (id: string, startTime: number, endTime: number): RecordingTelemetrySignal => ({
  id,
  kind: 'typing',
  startTime,
  endTime,
  point: null,
  data: { targetName: id, eventCount: 2 },
});
const click = (id: string, time: number, targetId = 'button'): RecordingActionEvent => ({
  id,
  kind: 'CLICK',
  time,
  duration: 0.45,
  point: { x: 0, y: 0 },
  label: 'Button',
  data: { targetId },
  preset: 'CLICK_RIPPLE',
});

it('merges short form inputs before the three-second threshold, preserving exact boundaries', () => {
  const input = [
    typing('a', 0, 1),
    typing('b', 1.999, 3),
    typing('c', 4, 6.999),
    typing('d', 8, 11),
  ];
  const result = normalizeRecordingSignals(input);
  expect(result.map((s) => [s.id, s.startTime, s.endTime])).toEqual([
    ['a', 0, 3],
    ['d', 8, 11],
  ]);
  expect(result[0]!.data['eventCount']).toBe(4);
  expect(normalizeRecordingSignals(result)).toEqual(result);
  expect(input[0]!.endTime).toBe(1);
});

it('never joins input across a capture pause or includes nontext changes', () => {
  const first = { ...typing('a', 0, 3), data: { captureSegment: 0 } };
  const second = { ...typing('b', 3.1, 6.1), data: { captureSegment: 1 } };
  const checkbox = { ...typing('check', 10, 15), data: { targetType: 'checkbox' } };
  expect(normalizeRecordingSignals([first, second, checkbox])).toEqual([first, second]);
});

it('suppresses sub-500ms same-target repeats but retains distinct and unknown targets', () => {
  const input = [
    click('a', 0),
    click('b', 0.499),
    click('c', 0.5),
    click('d', 0.6, 'other'),
    { ...click('e', 0.7), data: {} },
    { ...click('f', 0.8), data: {} },
  ];
  const result = normalizeRecordingActions(input);
  expect(result.map((e) => e.id)).toEqual(['a', 'c', 'd', 'e', 'f']);
  expect(normalizeRecordingActions(result)).toEqual(result);
});

it('retains a double-click as one captured action with its click count', () => {
  const result = normalizeRecordingActions([
    click('a', 1),
    { ...click('b', 1.2), data: { targetId: 'button', clickCount: 2 } },
  ]);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: 'a', data: { clickCount: 2 } });
});
