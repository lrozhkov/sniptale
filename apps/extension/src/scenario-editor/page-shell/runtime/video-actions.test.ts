import { expect, it } from 'vitest';
import { guideVideoFrameSourceSchema } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { projectGuideVideoActions, guideVideoActionAt } from './video-actions';
import type { RecordingActionEvent } from '../../../features/video/project/types';
const event: RecordingActionEvent = {
  id: 'click',
  kind: 'CLICK',
  time: 1,
  duration: 0.45,
  point: { x: 100, y: 200 },
  recordingPoint: { x: 0.25, y: 0.5 },
  label: 'Open',
  data: { targetName: 'Open', targetTag: 'button', value: 'private', token: 'secret' },
  preset: 'NONE',
};
it('projects only clicks and keys with verified source points and bounded descriptors', () => {
  const result = projectGuideVideoActions([
    event,
    { ...event, id: 'scroll', kind: 'SCROLL' },
    { ...event, id: 'key', kind: 'KEY', time: 2, recordingPoint: null },
  ]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    point: { x: 0.25, y: 0.5 },
    target: { name: 'Open', tag: 'button' },
  });
  expect(result[1]?.point).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/private|secret|token|value/);
  expect(projectGuideVideoActions([{ ...event, recordingPoint: null }])[0]?.point).toBeNull();
  expect(projectGuideVideoActions([{ ...event, time: NaN }])).toEqual([]);
});
it('selects the latest active action and never borrows future or stale actions', () => {
  const actions = projectGuideVideoActions([event, { ...event, id: 'next', time: 1.2 }]);
  expect(guideVideoActionAt(actions, 0.99)).toBeUndefined();
  expect(guideVideoActionAt(actions, 1)?.id).toBe('click');
  expect(guideVideoActionAt(actions, 1.25)?.id).toBe('next');
  expect(guideVideoActionAt(actions, 2)).toBeUndefined();
});
it('admits durable context only for matching frame intervals and rejects unbounded extras', () => {
  const action = projectGuideVideoActions([event])[0]!;
  const source = {
    kind: 'video-frame',
    recordingId: 'recording',
    filename: 'video',
    timeSeconds: 1.2,
    action,
  };
  expect(guideVideoFrameSourceSchema.parse(source)).toEqual(source);
  for (const change of [
    { timeSeconds: 2 },
    { recordingId: null },
    { action: { ...action, data: { token: 'secret' } } },
    { action: { ...action, label: 'x'.repeat(161) } },
    { action: { ...action, point: { x: 2, y: 0 } } },
  ]) {
    expect(guideVideoFrameSourceSchema.safeParse({ ...source, ...change }).success).toBe(false);
  }
});
