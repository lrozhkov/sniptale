import { expect, it } from 'vitest';
import type { RecordingActionEvent } from '../project/types';
import { groupHistoryScrollActions } from './scroll-history';

function scroll(
  id: string,
  time: number,
  data: RecordingActionEvent['data'] = {},
  duration = 0.45
): RecordingActionEvent {
  return {
    id,
    kind: 'SCROLL',
    time,
    duration,
    point: null,
    label: 'Scroll',
    preset: 'SCROLL_EMPHASIS',
    data: { eventType: 'scroll', captureSegment: 0, observationClockId: 'clock', ...data },
  };
}

it('groups interleaved wheel and scroll independently without changing capture facts', () => {
  const source = [
    scroll('wheel', 1, { eventType: 'wheel' }),
    scroll('scroll', 1.1),
    scroll('wheel-2', 1.2, { eventType: 'wheel' }),
    scroll('scroll-2', 1.3),
  ];
  const snapshot = structuredClone(source);
  const result = groupHistoryScrollActions(source);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ id: 'wheel', time: 1 });
  expect(result[0]?.duration).toBeCloseTo(0.65);
  expect(result[1]?.id).toBe('scroll');
  expect(result[1]?.duration).toBeCloseTo(0.65);
  expect(source).toEqual(snapshot);
});

it('uses the last observed onset for the gap instead of synthetic display duration', () => {
  const result = groupHistoryScrollActions([
    scroll('first', 1),
    scroll('joined', 1.5),
    scroll('separate', 2.01),
  ]);
  expect(result.map((event) => event.id)).toEqual(['first', 'separate']);
  expect(result[0]?.duration).toBeCloseTo(0.95);
});

it.each(['CLICK', 'KEY'] as const)('keeps %s as a barrier between scroll ranges', (kind) => {
  const barrier = { ...scroll('barrier', 1.2), kind, preset: 'NONE' as const };
  const source = [scroll('first', 1), barrier, scroll('second', 1.3)];
  expect(groupHistoryScrollActions(source)).toEqual(source);
});

it.each(['captureSegment', 'observationClockId', 'targetId'])(
  'does not cross a changed or unknown %s boundary',
  (key) => {
    const unknown = scroll('unknown', 1.2);
    delete unknown.data[key];
    const source = [
      scroll('first', 1, { [key]: key === 'captureSegment' ? 0 : 'first' }),
      scroll('second', 1.1, { [key]: key === 'captureSegment' ? 1 : 'second' }),
      unknown,
    ];
    expect(groupHistoryScrollActions(source)).toEqual(source);
  }
);

it.each(['ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'deltaMode'])(
  'keeps wheel ranges distinct when %s changes',
  (key) => {
    const source = [
      scroll('first', 1, { eventType: 'wheel', [key]: 0 }),
      scroll('second', 1.1, { eventType: 'wheel', [key]: 1 }),
    ];
    expect(groupHistoryScrollActions(source)).toEqual(source);
  }
);

it('does not use an invalid event to extend a valid range or swallow another one', () => {
  const invalid = [
    scroll('negative', -1),
    scroll('nan', Number.NaN),
    scroll('bad-duration', 1.1, {}, -1),
    scroll('infinite', 1.1, {}, Number.POSITIVE_INFINITY),
  ];
  for (const event of invalid) {
    const source = [scroll('first', 1), event, scroll('second', 1.2)];
    expect(groupHistoryScrollActions(source)).toEqual(source);
  }
});

it('retains legacy observations and non-scroll identities without fabricating metadata', () => {
  const first = scroll('legacy', 1);
  const second = scroll('legacy-2', 1.1);
  delete first.data['eventType'];
  delete second.data['eventType'];
  const source = [first, second, scroll('known', 1.2)];
  expect(groupHistoryScrollActions(source).map((event) => event.id)).toEqual(['legacy', 'known']);
  expect(groupHistoryScrollActions([first])[0]).toBe(first);
  expect(groupHistoryScrollActions([])).toEqual([]);
});
