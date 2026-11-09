import { expect, it } from 'vitest';
import type { RecordingActionEvent, RecordingTelemetrySignal } from './types';
import {
  normalizeRecordingActions,
  normalizeRecordingSignals,
  deriveLongRecordingTypingSignals,
} from './recording-actions';
import { isRecordingTelemetrySignal } from './validation/recording-telemetry';

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
  const result = deriveLongRecordingTypingSignals(input);
  expect(result.map((s) => [s.id, s.startTime, s.endTime])).toEqual([
    ['a', 0, 3],
    ['d', 8, 11],
  ]);
  expect(result[0]!.data['eventCount']).toBe(4);
  expect(deriveLongRecordingTypingSignals(result)).toEqual(result);
  expect(input[0]!.endTime).toBe(1);
});

it('never joins input across a capture pause or includes nontext changes', () => {
  const first = { ...typing('a', 0, 3), data: { captureSegment: 0 } };
  const second = { ...typing('b', 3.1, 6.1), data: { captureSegment: 1 } };
  const checkbox = { ...typing('check', 10, 15), data: { targetType: 'checkbox' } };
  expect(deriveLongRecordingTypingSignals([first, second, checkbox])).toEqual([first, second]);
});

it('retains independent same-target clicks as well as distinct and unknown targets', () => {
  const input = [
    click('a', 0),
    click('b', 0.499),
    click('c', 0.5),
    click('d', 0.6, 'other'),
    { ...click('e', 0.7), data: {} },
    { ...click('f', 0.8), data: {} },
  ];
  const result = normalizeRecordingActions(input);
  expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  expect(normalizeRecordingActions(result)).toEqual(result);
});

it('retains both captured presses and original click counts for a double-click', () => {
  const result = normalizeRecordingActions([
    click('a', 1),
    { ...click('b', 1.2), data: { targetId: 'button', clickCount: 2 } },
  ]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ id: 'a', data: { targetId: 'button' } });
  expect(result[0]!.data).not.toHaveProperty('clickCount');
  expect(result[1]).toMatchObject({ id: 'b', data: { clickCount: 2 } });
});

it('drops sub-500ms fragments before grouping, including bridges between real inputs', () => {
  const noise = Array.from({ length: 8 }, (_, i) => typing(`noise-${i}`, i * 0.6, i * 0.6 + 0.4));
  expect(deriveLongRecordingTypingSignals(noise)).toEqual([]);
  expect(
    deriveLongRecordingTypingSignals([
      typing('real-a', 0, 1.5),
      typing('noise', 2, 2.4),
      typing('real-b', 3, 4.5),
    ])
  ).toEqual([]);
  expect(
    deriveLongRecordingTypingSignals([
      typing('a', 0, 0.5),
      typing('b', 1, 3),
      typing('noise', 3.5, 3.9),
    ])
  ).toMatchObject([{ id: 'a', startTime: 0, endTime: 3, data: { eventCount: 4 } }]);
});

it('retains short raw inputs and independent observed gestures while keeping long typing derived', () => {
  const inputs = [typing('short', 1, 1), typing('brief', 2, 2.1)];
  expect(normalizeRecordingSignals(inputs)).toEqual(inputs);
  const actions = [
    click('one', 0),
    { ...click('two', 0.1), data: { gestureId: 'second', targetId: 'button' } },
  ];
  expect(normalizeRecordingActions(actions)).toEqual(actions);
  expect(deriveLongRecordingTypingSignals(inputs)).toEqual([]);
});

it('preserves every independently identified raw click beyond 2048 events regardless of target or spacing', () => {
  const actions = Array.from({ length: 3000 }, (_, index) =>
    click(`independent-${index}`, index / 1000)
  );
  const normalized = normalizeRecordingActions(actions.toReversed());
  expect(normalized).toHaveLength(3000);
  expect(normalized.every((action, index) => action === actions[index])).toBe(true);
  expect(actions).toHaveLength(3000);
});

it('retains all accepted raw control signals and warnings beyond 512 entries', () => {
  const signals: RecordingTelemetrySignal[] = Array.from({ length: 700 }, (_, index) => ({
    id: `raw-${index}`,
    kind: index % 2 ? 'static-frame' : 'typing',
    startTime: index,
    endTime: index,
    point: null,
    data:
      index % 2
        ? { source: 'recording-events', code: 'source-unavailable', severity: 'warning' }
        : { targetType: 'checkbox', eventCount: 1 },
  }));
  expect(signals.every(isRecordingTelemetrySignal)).toBe(true);
  const normalized = normalizeRecordingSignals(signals.toReversed());
  expect(normalized).toHaveLength(700);
  expect(normalized.every((signal, index) => signal === signals[index])).toBe(true);
  expect(
    deriveLongRecordingTypingSignals(signals).filter((signal) => signal.kind === 'typing')
  ).toEqual([]);
});
