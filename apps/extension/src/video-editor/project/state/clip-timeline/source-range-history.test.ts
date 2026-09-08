import { expect, it } from 'vitest';
import { create } from 'zustand';
import { setup } from '../insertion/material.test-support';
import { createVideoEditorProjectActions } from '../actions';
import { createVideoEditorTimelineState } from '../../../state/root-state';
import { createVideoEditorProjectHistoryActions } from '../../../state/history-actions';
import { createExportStateActions } from '../../../state/export-state';
import type { VideoEditorState } from '../../../state/types';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { resolveEffectInstanceTime } from '../../../../features/video/project/effect-instance/timing';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { createVideoProjectCursorTrack } from '../../../../features/video/project/defaults';
import { planTypingCompression } from './source-range';

function fixture() {
  const material = setup(true);
  material.asset.source = { kind: 'recording', recordingId: 'recording' };
  material.store.getState().appendMaterial(material.asset.id);
  const project = material.store.getState().project!;
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (!video.sourceInstanceId) throw new Error('Expected source instance');
  project.clips.push({
    ...video,
    id: 'repeat',
    sourceInstanceId: 'repeat-instance',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 10,
  });
  project.duration = 16;
  project.actionEvents = [
    {
      id: 'fact',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.25, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: video.sourceInstanceId,
        sourceEventId: 'raw-click',
        sourceTime: 5,
      },
      presentation: { duration: 1.2, offset: -0.2 },
    },
  ];
  project.cursorTrack = createVideoProjectCursorTrack();
  project.cursorTrack.samples = [
    {
      id: 'cursor',
      time: 5,
      x: 100,
      y: 150,
      visible: true,
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceClipId: video.id,
        sourceTime: 5,
      },
    },
  ];
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 4.5),
      id: 'zoom',
      duration: 1,
      targetAction: { eventId: 'fact', clipId: video.id },
      sourceBinding: {
        clipId: video.id,
        sourceStart: 4.5,
        sourceEnd: 5.5,
        animation: { start: 0, end: 1, duration: 1 },
      },
    },
  ];
  project.objectTracks = [
    {
      id: 'object',
      kind: 'object',
      source: 'telemetry',
      analysis: {
        sourceAssetId: video.assetId,
        sourceClipId: video.id,
        projectStartTime: 5,
        projectEndTime: 5,
        sampleFps: 1,
      },
      samples: [{ sourceClipId: video.id, time: 5, x: 100, y: 150, visible: true, confidence: 1 }],
    },
  ];
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'recording',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [{ id: 'typing', kind: 'typing', startTime: 2, endTime: 4, point: null, data: {} }],
  };
  const store = create<VideoEditorState>()((set, get) => ({
    ...createVideoEditorTimelineState(set),
    ...createVideoEditorProjectActions(set, get),
    ...createVideoEditorProjectHistoryActions(set, get),
    ...createExportStateActions(set),
  }));
  store.getState().setProject(project);
  store.getState().setRecordingTelemetry([telemetry]);
  const target = {
    recordingId: 'recording',
    sourceInstanceId: video.sourceInstanceId,
    signalId: 'typing',
    clipId: video.id,
  };
  return { store, video, telemetry, target, request: { ...target, targetPlaybackRate: 4 } };
}

it('selects the exact captured typing instance and previews without publishing edits', () => {
  const { store, target, request } = fixture();
  store.getState().selectHistorySpan(target);
  expect(store.getState().selection).toEqual({ kind: 'history-span', ...target });
  const before = store.getState();
  const snapshot = structuredClone(before.project);
  const plan = planTypingCompression(before.project!, before.recordingTelemetry, request);
  expect(plan.status).toBe('ready');
  expect(store.getState()).toBe(before);
  expect(before.project).toEqual(snapshot);
  store.getState().selectHistorySpan({ ...target, clipId: 'repeat' });
  expect(store.getState()).toBe(before);
});

it('applies both splits and rate as one Undo step with exact cursor, motion and object anchors', () => {
  const { store, request } = fixture();
  const before = store.getState();
  const facts = structuredClone(before.project!.actionEvents);
  expect(store.getState().applyTypingCompression(request, before.project!).status).toBe('applied');
  const after = store.getState();
  const parts = after
    .project!.clips.filter((clip) => clip.type === 'VIDEO')
    .filter((clip) => clip.id !== 'repeat');
  expect(parts.map((clip) => [clip.startTime, clip.duration, clip.playbackRate ?? 1])).toEqual([
    [0, 2, 1],
    [2, 0.5, 4],
    [2.5, 2, 1],
  ]);
  expect(
    after
      .project!.clips.filter((clip) => clip.type === 'AUDIO')
      .map((clip) => [clip.startTime, clip.duration, clip.playbackRate ?? 1])
  ).toEqual([
    [0, 2, 1],
    [2, 0.5, 4],
    [2.5, 2, 1],
  ]);
  const tail = parts[2]!;
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  expect(after.project!.actionEvents).toEqual(facts);
  expect(resolveVideoProjectActionOccurrences(after.project!)).toMatchObject([
    { eventId: 'fact', clipId: tail.id, time: 3.5 },
  ]);
  expect(after.project!.cursorTrack?.samples[0]).toMatchObject({
    time: 3.5,
    sourceAnchor: { sourceClipId: tail.id, sourceTime: 5 },
  });
  const activeMotion = after.project!.motionRegions?.filter((region) => region.duration > 0) ?? [];
  expect(activeMotion).toHaveLength(1);
  expect(activeMotion.find((region) => region.sourceBinding?.clipId === tail.id)).toMatchObject({
    startTime: 3,
    duration: 1,
    sourceBinding: { clipId: tail.id, sourceStart: 4.5, sourceEnd: 5.5 },
    targetAction: { eventId: 'fact', clipId: tail.id },
  });
  expect(after.project!.objectTracks?.[0]?.samples[0]).toMatchObject({
    time: 3.5,
    sourceClipId: tail.id,
  });
  expect(after.project!.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    startTime: 8.5,
    sourceInstanceId: 'repeat-instance',
    sourceStart: 0,
    sourceDuration: 6,
  });
  store.getState().undoProject();
  expect(store.getState().project!.actionEvents).toEqual(facts);
  expect(store.getState().project!.clips).toEqual(before.project!.clips);
  store.getState().redoProject();
  expect(store.getState().project!.clips).toEqual(after.project!.clips);
  store.getState().setProject(structuredClone(store.getState().project!));
  expect(store.getState().recordingTelemetry).toEqual([]);
  expect(store.getState().project!.actionEvents).toEqual(facts);
  expect(resolveVideoProjectActionOccurrences(store.getState().project!)).toMatchObject([
    { eventId: 'fact', clipId: tail.id, time: 3.5 },
  ]);
});

it('rejects stale project snapshots and removed or mismatched raw signals without a history write', () => {
  const { store, request } = fixture();
  const before = store.getState();
  expect(
    store.getState().applyTypingCompression(request, structuredClone(before.project!))
  ).toEqual({ status: 'stale' });
  for (const patch of [{ signalId: 'missing' }, { sourceInstanceId: 'repeat-instance' }]) {
    expect(
      store.getState().applyTypingCompression({ ...request, ...patch }, before.project!)
    ).toEqual({ status: 'blocked' });
    expect(store.getState()).toBe(before);
  }
  store.getState().setRecordingTelemetry([]);
  const withoutRaw = store.getState();
  expect(store.getState().applyTypingCompression(request, withoutRaw.project!)).toEqual({
    status: 'blocked',
  });
  expect(store.getState()).toBe(withoutRaw);
});

it('remaps the selected action pair through the canonical split without selecting a repeated placement', () => {
  const { store, video } = fixture();
  store.getState().selectActionOccurrence('fact', video.id);
  store.getState().splitClipAt(video.id, 4);
  const after = store.getState();
  const occurrence = resolveVideoProjectActionOccurrences(after.project!).find(
    (item) => item.eventId === 'fact'
  )!;
  expect(occurrence.clipId).not.toBe(video.id);
  expect(occurrence.clipId).not.toBe('repeat');
  expect(after.selection).toEqual({
    kind: 'action-occurrence',
    eventId: 'fact',
    clipId: occurrence.clipId,
  });
  expect(after.project!.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    startTime: 10,
    sourceInstanceId: 'repeat-instance',
  });
});

it('preserves clip effect document time across both compression splits and the accelerated middle', () => {
  const { store, request, video } = fixture();
  const project = store.getState().project!;
  store.setState({
    project: {
      ...project,
      effectInstances: [
        {
          id: 'effect',
          kind: 'targetEffect',
          snapshotId: 'snapshot',
          enabled: true,
          controls: {},
          target: { kind: 'clip', clipId: video.id },
          startTime: 0,
          duration: 6,
          playbackRate: 2,
        },
      ],
    },
  });
  expect(store.getState().applyTypingCompression(request, store.getState().project!).status).toBe(
    'applied'
  );
  const after = store.getState().project!;
  const parts = after.clips
    .filter((clip) => clip.type === 'VIDEO')
    .filter((clip) => clip.id !== 'repeat');
  const effects = after.effectInstances!;
  expect(effects).toHaveLength(3);
  for (const [index, time, expected] of [
    [0, 1, 2],
    [1, 2.25, 6],
    [2, 3.5, 10],
  ]) {
    const effect = effects.find(
      (item) => item.target.kind === 'clip' && item.target.clipId === parts[index!]!.id
    )!;
    expect(effect).toBeDefined();
    expect(resolveEffectInstanceTime(effect, 12, time!)).toMatchObject({ effectTime: expected });
  }
});
