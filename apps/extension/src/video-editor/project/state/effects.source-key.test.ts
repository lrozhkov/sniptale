import { expect, it } from 'vitest';
import { patchReviewClicks } from '../../../features/video/review/advanced/click-animation';
import { patchReviewKeys } from '../../../features/video/project/action-feedback/key-animation';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory } from '../history';

function sourceKeyStore() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 0.1,
        duration: 0.3,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: { keyboardOnsetTime: 0.1, downTime: 0.1, upTime: 0.4 },
      },
    ],
  });
  project.actionEvents[0]!.presentation = { duration: 4, offset: 1 };
  project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
    enabled: true,
    before: 0.4,
    after: 0.6,
    offset: 0.1,
    style: { fontFamily: 'monospace', color: '#12345680' },
  });
  project.actionFeedback!.push({
    ...structuredClone(project.actionFeedback![0]!),
    sourceInstanceId: 'other',
  });
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, event: project.actionEvents[0]!, clipId: project.clips[0]!.id };
}
it('moves a clipped key caption by a result-time delta without changing source or dormant legacy fields', () => {
  const { store, event, clipId } = sourceKeyStore();
  const before = store.getState().project!;
  store.getState().updateActionEventDetails(event.id, { clipId, time: 0 });
  expect(store.getState().project).toBe(before);
  store.getState().updateActionEventDetails(event.id, { clipId, time: 0.2 });
  const next = store.getState().project!;
  expect(next.actionFeedback![0]!.keyStyles![0]).toMatchObject({
    offset: expect.closeTo(0.3, 10),
    before: 0.4,
    after: 0.6,
    style: { fontFamily: 'monospace', color: '#12345680' },
  });
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(next.actionFeedback![1]).toEqual(before.actionFeedback![1]);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, next);
  if (undo?.status !== 'applied') throw new Error('Expected key edit undo.');
  expect(undo.project.actionFeedback).toEqual(before.actionFeedback);
  store.getState().updateActionEventDetails(event.id, { clipId, time: 100 });
  expect(store.getState().project!.actionFeedback![0]!.keyStyles![0]!.offset).toBe(2);
});
it('retains combined event admission and refuses key source-point edits', () => {
  const { store, event, clipId } = sourceKeyStore();
  const before = store.getState().project!;
  store.getState().updateActionEventDetails(event.id, { clipId, point: { x: 0.5, y: 0.5 } });
  expect(store.getState().project).toBe(before);
  store.getState().updateActionEventDetails(event.id, {
    clipId,
    time: 0.2,
    presentation: { ...event.presentation, enabled: false },
  });
  expect(store.getState().project!.actionFeedback![0]!.keyStyles![0]!.offset).toBeCloseTo(0.3, 10);
  expect(store.getState().project!.actionEvents[0]!.presentation).toEqual({
    ...event.presentation,
    enabled: false,
  });
});
it('refuses locked, missing occurrence and nonfinite key caption time commands', () => {
  const { store, event, clipId } = sourceKeyStore();
  const before = store.getState().project!;
  for (const patch of [
    { clipId: 'missing', time: 1 },
    { clipId, time: NaN },
    { clipId, time: Infinity },
  ]) {
    store.getState().updateActionEventDetails(event.id, patch);
    expect(store.getState().project).toBe(before);
  }
  store.getState().setProject({
    ...before,
    utilityLanes: {
      ...getVideoProjectUtilityLanes(before),
      actions: { ...getVideoProjectUtilityLanes(before).actions, locked: true },
    },
  });
  const locked = store.getState().project;
  store.getState().updateActionEventDetails(event.id, { clipId, time: 1 });
  expect(store.getState().project).toBe(locked);
});

it('preserves independent captured key styles when a click moves through the shared source-time command', () => {
  const { store, event, clipId } = sourceKeyStore();
  const project = structuredClone(store.getState().project!);
  if (event.anchor.kind !== 'recording-source') throw new Error('Expected captured key.');
  const click = {
    ...structuredClone(event),
    id: 'click-event',
    kind: 'CLICK' as const,
    anchor: { ...event.anchor, sourceEventId: 'click' },
    point: { x: 0.4, y: 0.6 },
    label: 'Click',
    preset: 'CLICK_RIPPLE' as const,
    data: { downTime: 0.1, upTime: 0.2, gestureType: 'click', completion: 'released' },
  };
  project.actionEvents.push(click);
  project.actionFeedback![0]!.gestureStyles = patchReviewClicks([], ['click'], {
    before: 0.4,
    after: 0.6,
    offset: 0,
  });
  store.getState().setProject(project);
  const before = store.getState().project!;
  store.getState().updateActionEventDetails(click.id, { clipId, time: 0.2 });
  const next = store.getState().project!;
  expect(next.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
    offset: 0.2,
    before: 0.4,
    after: 0.6,
  });
  expect(next.actionFeedback![0]!.keyStyles).toEqual(before.actionFeedback![0]!.keyStyles);
  expect(next.actionEvents).toEqual(before.actionEvents);
  store.getState().updateActionEventDetails(click.id, { clipId, time: 0 });
  expect(store.getState().project).toBe(next);
  store.getState().updateActionEventDetails(click.id, { clipId, time: 100 });
  expect(store.getState().project!.actionFeedback![0]!.gestureStyles![0]!.offset).toBe(2);
});
