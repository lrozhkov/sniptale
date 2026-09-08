import {
  getVideoProjectActionPresentation,
  resolveVideoProjectActionPresentations,
} from '../../../../features/video/project/action-presentation';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { expect, it, vi } from 'vitest';
import { setup } from './material.test-support';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { undoVideoEditorProjectHistory } from '../../history';
import type { VideoProjectActionEvent } from '../../../../features/video/project/types';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';

it('keeps captured duration when importing a short source interval', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'source',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    signals: [],
    actionEvents: [
      {
        id: 'raw',
        kind: 'CLICK',
        time: 2.8,
        duration: 4,
        preset: 'CLICK_RIPPLE',
        label: 'Click',
        data: {},
        point: null,
      },
    ],
  };
  expect(store.getState().appendMaterial(asset.id, { start: 2, end: 3 }, telemetry).status).toBe(
    'placed'
  );
  expect(store.getState().project!.actionEvents).toHaveLength(1);
  expect(store.getState().project!.actionEvents[0]?.capturedDuration).toBe(4);
  expect(telemetry.actionEvents[0]?.duration).toBe(4);
});

it('inserts a gap without inventing a captured click at the cut', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  const captured = {
    id: 'captured',
    kind: 'CLICK' as const,
    capturedDuration: 4,
    point: { x: 0.5, y: 0.7 },
    label: 'Click',
    data: {},
    anchor: {
      kind: 'recording-source' as const,
      recordingId: 'source',
      sourceInstanceId: project.clips.find((clip) => clip.type === 'VIDEO')!.sourceInstanceId!,
      sourceEventId: 'raw',
      sourceTime: 2.8,
    },
  };
  store.setState({ project: { ...project, actionEvents: [captured] }, currentTime: 3 });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual([captured]);
});

function manualEvent(id: string, time: number): VideoProjectActionEvent {
  return {
    id,
    kind: 'CLICK',
    anchor: { kind: 'project', time },
    capturedDuration: 4,
    point: { x: 50, y: 70 },
    label: 'Click',
    data: {},
    presentation: { duration: 4, offset: 0.1 },
  };
}

it('shifts only manual points at or after insertion once and preserves earlier presentation', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const events = [manualEvent('earlier', 1), manualEvent('boundary', 3), manualEvent('later', 5)];
  store.setState({ project: { ...base, actionEvents: events } });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const state = store.getState();
  const after = hydrateVideoProject(state.project!);
  expect(after.actionEvents).toEqual([
    events[0],
    { ...events[1], anchor: { kind: 'project', time: 9 } },
    { ...events[2], anchor: { kind: 'project', time: 11 } },
  ]);
  store.setState({ currentTime: 10 });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(hydrateVideoProject(store.getState().project!).actionEvents).toEqual([
    events[0],
    { ...events[1], anchor: { kind: 'project', time: 9 } },
    { ...events[2], anchor: { kind: 'project', time: 17 } },
  ]);
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status === 'applied') expect(undo.project.actionEvents).toEqual(events);
});

it.each([3, 4])('rejects a locked point at %s without publishing or changing history', (time) => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    project: {
      ...base,
      actionEvents: [manualEvent('locked', time)],
      utilityLanes: {
        ...getVideoProjectUtilityLanes(base),
        actions: { visible: true, locked: true },
      },
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

it('allows insertion after a locked point without slicing its long presentation', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event = manualEvent('earlier', 2);
  store.setState({
    project: {
      ...base,
      actionEvents: [event],
      utilityLanes: {
        ...getVideoProjectUtilityLanes(base),
        actions: { visible: true, locked: true },
      },
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual([event]);
});

it('keeps both framing parts targeted at the same real event', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event = manualEvent('target', 1);
  const region = {
    ...createVideoProjectMotionRegion(base, 1),
    duration: 4,
    focusMode: 'ACTION' as const,
    targetAction: { eventId: event.id, clipId: null },
  };
  store.setState({ project: { ...base, actionEvents: [event], motionRegions: [region] } });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual([event]);
  expect(store.getState().project!.motionRegions?.map(({ targetAction }) => targetAction)).toEqual([
    { eventId: event.id, clipId: null },
    { eventId: event.id, clipId: null },
  ]);
});

it('does not replay a pre-cut default click at the end of the inserted gap', async () => {
  const { resolveVideoCompositionActions } =
    await import('../../../../features/video/composition/timeline/frame/actions');
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event = { ...manualEvent('default', 2.8), capturedDuration: 0, presentation: {} };
  store.setState({ project: { ...base, actionEvents: [event] } });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual([event]);
  expect(resolveVideoCompositionActions(store.getState().project!, 3.2)).toHaveLength(1);
  expect(resolveVideoCompositionActions(store.getState().project!, 9.2)).toEqual([]);
});

it.each([1, 2])('preserves real captured IDs before/on/after the cut at rate %s', (rate) => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  store.getState().appendMaterial(asset.id);
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const clip = base.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const cut = 3 / rate;
  const events: VideoProjectActionEvent[] = [2.8, 3, 4].map((sourceTime, index) => ({
    id: `captured-${index}`,
    kind: 'CLICK',
    capturedDuration: 4,
    point: { x: 0.5, y: 0.7 },
    label: 'Click',
    data: {},
    presentation: { duration: 2, offset: -0.1 },
    anchor: {
      kind: 'recording-source',
      recordingId: 'source',
      sourceInstanceId: clip.sourceInstanceId!,
      sourceEventId: `raw-${index}`,
      sourceTime,
    },
  }));
  store.setState({
    currentTime: cut,
    project: {
      ...base,
      clips: base.clips.map((item) =>
        item.id === clip.id ? { ...item, playbackRate: rate, duration: 6 / rate } : item
      ),
      actionEvents: events,
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  expect(after.actionEvents.map(({ id }) => id)).toEqual(events.map(({ id }) => id));
  expect(resolveVideoProjectActionOccurrences(after).map(({ time }) => time)).toEqual([
    2.8 / rate,
    cut + 6,
    4 / rate + 6,
  ]);
  expect(after.actionEvents[0]).toEqual(events[0]);
  const tailId = resolveVideoProjectActionOccurrences(after).find(
    ({ eventId }) => eventId === 'captured-1'
  )!.clipId!;
  expect(tailId).not.toBe(clip.id);
  expect(
    resolveVideoProjectActionOccurrences(after).find(({ eventId }) => eventId === 'captured-2')
      ?.clipId
  ).toBe(tailId);
  expect(after.clips.find(({ id }) => id === tailId)?.startTime).toBe(cut + 6);
  for (const [index, event] of after.actionEvents.entries()) {
    expect(event.capturedDuration).toBe(4);
    expect(event.presentation).toEqual(events[index]!.presentation);
    expect(event.anchor).toEqual(events[index]!.anchor);
    expect(event).not.toHaveProperty('animation');
  }
  store.getState().deleteClip(clip.id);
  expect(store.getState().project!.actionEvents).toEqual(events);
  expect(
    resolveVideoProjectActionOccurrences(store.getState().project!).map(({ eventId }) => eventId)
  ).toEqual(['captured-1', 'captured-2']);
  store.setState({ currentTime: cut + 6 });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(
    resolveVideoProjectActionOccurrences(store.getState().project!).map(({ eventId, time }) => [
      eventId,
      time,
    ])
  ).toEqual([
    ['captured-1', cut + 12],
    ['captured-2', 4 / rate + 12],
  ]);
  store.getState().moveClip(tailId, 40);
  const moved = hydrateVideoProject(store.getState().project!);
  expect(
    resolveVideoProjectActionOccurrences(moved).map(({ eventId, time }) => [eventId, time])
  ).toEqual([
    ['captured-1', 40],
    ['captured-2', 40 + 1 / rate],
  ]);
});

it('clips presentation at the source end without changing captured facts or settings', async () => {
  const { resolveVideoProjectActionPresentations } =
    await import('../../../../features/video/project/action-presentation');
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  store.getState().appendMaterial(asset.id);
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event: VideoProjectActionEvent = {
    id: 'source-end',
    kind: 'CLICK',
    capturedDuration: 4,
    point: { x: 0.1, y: 0.2 },
    label: 'Click',
    data: {},
    presentation: { duration: 2 },
    anchor: {
      kind: 'recording-source',
      recordingId: 'source',
      sourceInstanceId: base.clips.find((clip) => clip.type === 'VIDEO')!.sourceInstanceId!,
      sourceEventId: 'raw',
      sourceTime: 5,
    },
  };
  store.setState({ project: { ...base, actionEvents: [event] } });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  expect(after.actionEvents).toHaveLength(1);
  expect(after.actionEvents[0]).toMatchObject({
    id: event.id,
    capturedDuration: 4,
    presentation: event.presentation,
  });
  expect(after.actionEvents[0]).not.toHaveProperty('animation');
  expect(resolveVideoProjectActionPresentations(after)[0]).toMatchObject({
    animationStart: 11,
    duration: 2,
    end: 12,
  });
});

it('keeps a frame-aligned captured point valid without creating cut fragments', async () => {
  const { isActionEvent } =
    await import('../../../../features/video/project/validation/interaction');
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const event: VideoProjectActionEvent = {
    id: 'frame-click',
    kind: 'CLICK',
    capturedDuration: 1,
    point: null,
    label: '',
    data: {},
    anchor: {
      kind: 'recording-source',
      recordingId: 'source',
      sourceInstanceId: base.clips.find((clip) => clip.type === 'VIDEO')!.sourceInstanceId!,
      sourceEventId: 'raw',
      sourceTime: 1 / 30,
    },
  };
  store.setState({ currentTime: 2 / 30, project: { ...base, actionEvents: [event] } });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.actionEvents).toEqual([event]);
  expect(isActionEvent(store.getState().project!.actionEvents[0])).toBe(true);
});

it.each(['appendMaterial', 'insertMaterial', 'overlayMaterial'] as const)(
  '%s creates independent captured actions with the selected video range in one transaction',
  (command) => {
    const { store, asset } = setup(true);
    if (asset.source.kind !== 'project-asset') throw new Error('Expected copied asset');
    asset.source.originRecordingId = 'recording';
    const telemetry: RecordingTelemetryEntry = {
      recordingId: 'recording',
      createdAt: 1,
      updatedAt: 1,
      captureMode: null,
      viewport: null,
      cursorTrack: null,
      signals: [],
      actionEvents: [1, 2, 3, 4].map((time) => ({
        id: `click-${time}`,
        kind: 'CLICK',
        preset: 'CLICK_RIPPLE',
        point: { x: 10, y: 20 },
        label: 'Click',
        data: {},
        time,
        duration: 0.4,
      })),
    };
    const before = store.getState().project!;
    const placed = store.getState()[command](asset.id, { start: 2, end: 4 }, telemetry);
    expect(placed.status).toBe('placed');
    const state = store.getState();
    expect(state.project!.actionEvents).toHaveLength(4);
    expect(
      state.project!.actionEvents.map((event) =>
        event.anchor.kind === 'recording-source' ? event.anchor.sourceTime : null
      )
    ).toEqual([1, 2, 3, 4]);
    expect(
      new Set(
        state.project!.actionEvents.map((event) =>
          event.anchor.kind === 'recording-source' ? event.anchor.sourceInstanceId : null
        )
      ).size
    ).toBe(1);
    expect(state.projectHistory.past).toHaveLength(1);
    const firstIds = state.project!.actionEvents.map((event) => event.id);
    store.getState().appendMaterial(asset.id, { start: 2, end: 4 }, telemetry);
    expect(store.getState().project!.actionEvents).toHaveLength(8);
    expect(new Set(store.getState().project!.actionEvents.map((event) => event.id)).size).toBe(8);
    expect(
      store
        .getState()
        .project!.actionEvents.slice(0, 4)
        .map((event) => event.id)
    ).toEqual(firstIds);
    const captured = store.getState().project!.actionEvents;
    store.getState().appendMaterial(
      asset.id,
      { start: 2, end: 4 },
      {
        ...telemetry,
        recordingId: 'unrelated-source',
      }
    );
    expect(store.getState().project!.actionEvents).toEqual(captured);
    const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
    expect(undo?.status).toBe('applied');
    if (undo?.status === 'applied')
      expect(undo.project).toEqual({ ...before, updatedAt: undo.project.updatedAt });
  }
);

it('retains the complete known source history when only a narrow range is inserted', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'source',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    signals: [],
    actionEvents: [1, 2.5, 4].map((time, index) => ({
      id: `raw-${index}`,
      kind: 'CLICK',
      time,
      duration: 0.4,
      point: null,
      label: `Source event ${index}`,
      data: {},
      preset: 'CLICK_RIPPLE',
    })),
  };
  expect(store.getState().appendMaterial(asset.id, { start: 2, end: 3 }, telemetry).status).toBe(
    'placed'
  );
  const inserted = store.getState().project!;
  expect(inserted.actionEvents.map(({ label }) => label)).toEqual([
    'Source event 0',
    'Source event 1',
    'Source event 2',
  ]);
  const facts = structuredClone(inserted.actionEvents);
  store.getState().trimClipEnd(inserted.clips[0]!.id, 3);
  expect(store.getState().project!.actionEvents).toEqual(facts);
});

it('lets appended captured keys inherit global keystroke visibility', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'source' };
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'source',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    signals: [],
    actionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 0.7,
        preset: 'NONE',
        label: 'Ctrl+S',
        data: { key: 's', ctrlKey: true },
        point: null,
      },
    ],
  };
  expect(store.getState().appendMaterial(asset.id, undefined, telemetry).status).toBe('placed');
  const project = hydrateVideoProject(store.getState().project!);
  expect(project.actionEvents[0]?.presentation).toBeUndefined();
  expect(resolveVideoProjectActionPresentations(project)[0]?.enabled).toBe(false);
  project.actionPresentation = {
    ...getVideoProjectActionPresentation(project),
    showKeystrokes: true,
  };
  expect(resolveVideoProjectActionPresentations(project)[0]).toMatchObject({
    enabled: true,
    renderKind: 'keystroke',
  });
});
