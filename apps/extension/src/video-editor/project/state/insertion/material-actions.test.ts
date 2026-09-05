import { expect, it, vi } from 'vitest';
import { setup } from './material.test-support';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { undoVideoEditorProjectHistory } from '../../history';

it('preserves manual action phase across insertion, repeated insertion and hydration', async () => {
  const { resolveVideoCompositionActions } =
    await import('../../../../features/video/composition/timeline/frame/actions');
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event = {
    id: 'manual',
    kind: 'CLICK' as const,
    time: 1,
    duration: 4,
    point: { x: 50, y: 70 },
    label: 'Click',
    data: {},
    preset: 'CLICK_RIPPLE' as const,
    timeBasis: 'project' as const,
  };
  store.setState({
    project: { ...base, actionEvents: [event, { ...event, id: 'later', time: 5, duration: 0.5 }] },
  });
  const before = store.getState().project!;
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  expect(after.actionEvents.map(({ time, duration }) => [time, duration])).toEqual([
    [1, 2],
    [9, 2],
    [11, 0.5],
  ]);
  for (const originalTime of [1, 2, 2.9, 3, 4, 4.9]) {
    const oldState = resolveVideoCompositionActions(before, originalTime)[0]!;
    const newState = resolveVideoCompositionActions(
      after,
      originalTime < 3 ? originalTime : originalTime + 6
    )[0]!;
    expect(newState.progress).toBeCloseTo(oldState.progress);
    expect(newState.point).toEqual(oldState.point);
  }
  for (const gapTime of [3, 6, 8.999])
    expect(resolveVideoCompositionActions(after, gapTime)).toEqual([]);
  store.setState({ currentTime: 10 });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const repeated = hydrateVideoProject(store.getState().project!);
  expect(resolveVideoCompositionActions(repeated, 16.5)[0]!.progress).toBeCloseTo(
    resolveVideoCompositionActions(before, 4.5)[0]!.progress
  );
});

it('rejects affected locked action intervals without publishing or changing history', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    project: {
      ...base,
      utilityLanes: {
        ...getVideoProjectUtilityLanes(base),
        actions: { visible: true, locked: true },
      },
      actionEvents: [
        {
          id: 'locked-action',
          kind: 'CLICK',
          time: 2,
          duration: 2,
          point: null,
          label: '',
          data: {},
          preset: 'CLICK_RIPPLE',
          timeBasis: 'project',
        },
      ],
    },
  });
  const before = store.getState();
  const listener = vi.fn();
  store.subscribe(listener);
  expect(store.getState().insertMaterial(asset.id)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

it('rebinds the trailing action zoom and leaves locked earlier actions untouched', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event = {
    id: 'manual-target',
    kind: 'CLICK' as const,
    time: 1,
    duration: 4,
    point: { x: 50, y: 70 },
    label: '',
    data: {},
    preset: 'SPOTLIGHT' as const,
    timeBasis: 'project' as const,
  };
  const region = {
    ...createVideoProjectMotionRegion(base, 1),
    duration: 4,
    focusMode: 'ACTION' as const,
    targetActionEventId: event.id,
  };
  store.setState({ project: { ...base, actionEvents: [event], motionRegions: [region] } });
  store.getState().insertMaterial(asset.id);
  const after = store.getState().project!;
  expect(after.motionRegions![0]!.targetActionEventId).toBe(event.id);
  expect(after.motionRegions![1]!.targetActionEventId).toBe(after.actionEvents[1]!.id);
  store.setState({
    currentTime: 12,
    project: {
      ...after,
      utilityLanes: {
        ...getVideoProjectUtilityLanes(after),
        actions: { visible: true, locked: true },
      },
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual(after.actionEvents);
});

it('splits a default-duration click without extending its effect and restores it with undo', async () => {
  const { resolveVideoCompositionActions } =
    await import('../../../../features/video/composition/timeline/frame/actions');
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    project: {
      ...base,
      actionEvents: [
        {
          id: 'default-click',
          kind: 'CLICK',
          time: 2.8,
          duration: 0,
          point: null,
          label: '',
          data: {},
          preset: 'CLICK_RIPPLE',
          timeBasis: 'project',
        },
      ],
    },
  });
  const before = store.getState().project!;
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const state = store.getState();
  expect(resolveVideoCompositionActions(state.project!, 9.2)[0]!.progress).toBeCloseTo(
    resolveVideoCompositionActions(before, 3.2)[0]!.progress
  );
  expect(resolveVideoCompositionActions(state.project!, 9.5)).toEqual([]);
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status === 'applied') expect(undo.project.actionEvents).toEqual(before.actionEvents);
});

it.each([1, 2])(
  'keeps split recording action phases and exact source ownership at rate %s',
  async (rate) => {
    const { resolveVideoCompositionActions } =
      await import('../../../../features/video/composition/timeline/frame/actions');
    const { store, asset } = setup();
    asset.source = { kind: 'recording', recordingId: 'source-recording' };
    store.getState().appendMaterial(asset.id);
    store.getState().appendMaterial(asset.id);
    const base = store.getState().project!;
    const clip = base.clips[0]!;
    const cut = 3 / rate;
    const start = 1 / rate;
    store.setState({
      currentTime: cut,
      project: {
        ...base,
        clips: base.clips.map((item) =>
          item.id === clip.id ? { ...item, playbackRate: rate, duration: 6 / rate } : item
        ),
        actionEvents: [
          {
            id: 'source-action',
            kind: 'CLICK',
            time: start,
            duration: 4 / rate,
            point: { x: 50, y: 70 },
            label: '',
            data: {},
            preset: 'CLICK_RIPPLE',
            sourceAnchor: {
              kind: 'recording-source',
              recordingId: 'source-recording',
              sourceClipId: clip.id,
              sourceTime: 1,
            },
          },
        ],
      },
    });
    const before = store.getState().project!;
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const after = hydrateVideoProject(store.getState().project!);
    expect(after.actionEvents).toHaveLength(2);
    const tail = after.clips.find((item) => item.startTime === cut + 6 && item.id !== clip.id)!;
    expect(after.actionEvents[1]!.sourceAnchor).toEqual({
      kind: 'recording-source',
      recordingId: 'source-recording',
      sourceClipId: tail.id,
      sourceTime: 3,
    });
    for (const originalTime of [2 / rate, 3 / rate, 4 / rate]) {
      const expected = resolveVideoCompositionActions(before, originalTime)[0]!;
      expect(
        resolveVideoCompositionActions(
          after,
          originalTime < cut ? originalTime : originalTime + 6
        )[0]!.progress
      ).toBeCloseTo(expected.progress);
    }
    for (const time of [cut, cut + 3, cut + 5.999])
      expect(resolveVideoCompositionActions(after, time)).toEqual([]);
    store.getState().deleteClip(clip.id);
    const removed = store.getState().project!;
    expect(removed.actionEvents).toHaveLength(1);
    expect(removed.actionEvents[0]!.sourceAnchor?.sourceClipId).toBe(tail.id);
    expect(resolveVideoCompositionActions(removed, 4 / rate + 6)[0]!.progress).toBeCloseTo(0.75);
    store.setState({ currentTime: 4 / rate + 6 });
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const repeated = hydrateVideoProject(store.getState().project!);
    expect(resolveVideoCompositionActions(repeated, 4.5 / rate + 12)[0]!.progress).toBeCloseTo(
      0.875
    );
    const last = repeated.actionEvents.find((event) => event.sourceAnchor?.sourceTime === 4)!;
    store.getState().moveClip(last.sourceAnchor!.sourceClipId, 40);
    const moved = hydrateVideoProject(store.getState().project!);
    expect(resolveVideoCompositionActions(moved, 40 + 0.5 / rate)[0]!.progress).toBeCloseTo(0.875);
  }
);

it('clips a source effect at its owning media end instead of leaking into the next use', async () => {
  const { resolveVideoCompositionActions } =
    await import('../../../../features/video/composition/timeline/frame/actions');
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source-recording' };
  store.getState().appendMaterial(asset.id);
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    project: {
      ...base,
      actionEvents: [
        {
          id: 'source-end',
          kind: 'CLICK',
          time: 5,
          duration: 2,
          point: null,
          label: '',
          data: {},
          preset: 'CLICK_RIPPLE',
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'source-recording',
            sourceClipId: base.clips[0]!.id,
            sourceTime: 5,
          },
        },
      ],
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  expect(after.actionEvents[0]).toMatchObject({
    time: 11,
    duration: 1,
    animation: { start: 0, end: 1, duration: 2 },
  });
  expect(resolveVideoCompositionActions(after, 11.5)[0]!.progress).toBeCloseTo(0.25);
  expect(resolveVideoCompositionActions(after, 12)).toEqual([]);
});

it('keeps frame-aligned source action slices valid for persistence despite floating point rounding', async () => {
  const { isActionEvent } =
    await import('../../../../features/video/project/validation/interaction');
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source-recording' };
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    currentTime: 2 / 30,
    project: {
      ...base,
      actionEvents: [
        {
          id: 'frame-click',
          kind: 'CLICK',
          time: 1 / 30,
          duration: 1,
          point: null,
          label: '',
          data: {},
          preset: 'CLICK_RIPPLE',
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'source-recording',
            sourceClipId: base.clips[0]!.id,
            sourceTime: 1 / 30,
          },
        },
      ],
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const events = store.getState().project!.actionEvents;
  expect(events).toHaveLength(2);
  for (const event of events) expect(isActionEvent(event)).toBe(true);
});
