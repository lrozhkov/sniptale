import { expect, it } from 'vitest';
import { REVIEW_CLICK_DEFAULT } from '../../../features/video/project/action-feedback/validation';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory } from '../history';

function sourceClickStore() {
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
        id: 'click',
        kind: 'CLICK',
        time: 0.1,
        duration: 0.1,
        point: { x: 0.4, y: 0.6 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
  });
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'click', effect: 'ripple', before: 0.4, after: 0.6 },
  ];
  project.actionFeedback!.push({
    ...structuredClone(project.actionFeedback![0]!),
    sourceInstanceId: 'other',
  });
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, event: project.actionEvents[0]!, clipId: project.clips[0]!.id };
}

it('writes source point drags to shared offsets and preserves capture facts and independent instances', () => {
  const { store, event, clipId } = sourceClickStore();
  const before = structuredClone(store.getState().project!);
  store.getState().updateActionEventDetails(event.id, { clipId, point: { x: 0.7, y: 0.2 } });
  const next = store.getState().project!;
  expect(next.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
    effect: 'ripple',
    x: expect.closeTo(0.3, 12),
    y: expect.closeTo(-0.4, 12),
    before: 0.4,
  });
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(next.actionFeedback![1]).toEqual(before.actionFeedback![1]);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, next);
  if (undo?.status !== 'applied') throw new Error('Expected point edit undo');
  expect(undo.project.actionFeedback).toEqual(before.actionFeedback);
  store.getState().updateActionEventDetails(event.id, { clipId, point: null });
  expect(store.getState().project!.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
    x: 0,
    y: 0,
    effect: 'ripple',
  });
  const reset = store.getState().project;
  store.getState().updateActionEventDetails(event.id, { clipId, point: null });
  expect(store.getState().project).toBe(reset);
});

it('moves the clipped visual start by a delta without jumping or rewriting source time', () => {
  const { store, event, clipId } = sourceClickStore();
  const before = store.getState().project!;
  store.getState().updateActionEventDetails(event.id, { clipId, time: 0 });
  expect(store.getState().project).toBe(before);
  store.getState().updateActionEventDetails(event.id, { clipId, time: 0.2 });
  expect(store.getState().project!.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
    offset: 0.2,
    before: 0.4,
    after: 0.6,
  });
  expect(store.getState().project!.actionEvents).toEqual(before.actionEvents);
  store.getState().updateActionEventDetails(event.id, { clipId, time: 100 });
  expect(store.getState().project!.actionFeedback![0]!.gestureStyles![0]!.offset).toBe(2);
});

it('keeps combined admission edits and refuses locked or missing source click targets', () => {
  const { store, event, clipId } = sourceClickStore();
  store.getState().updateActionEventDetails(event.id, {
    clipId,
    point: { x: 0.5, y: 0.5 },
    presentation: { enabled: false },
  });
  const edited = store.getState().project!;
  expect(edited.actionEvents[0]!.presentation).toEqual({ enabled: false });
  expect(edited.actionFeedback![0]!.gestureStyles![0]!.x).toBeCloseTo(0.1, 12);
  store.getState().updateActionEventDetails(event.id, { clipId: 'missing', point: null });
  expect(store.getState().project).toBe(edited);
  const lanes = getVideoProjectUtilityLanes(edited);
  store.getState().setProject({
    ...edited,
    utilityLanes: { ...lanes, actions: { ...lanes.actions, locked: true } },
  });
  const locked = store.getState().project;
  store.getState().updateActionEventDetails(event.id, { clipId, time: 1, point: null });
  expect(store.getState().project).toBe(locked);
});
