import { undoVideoEditorProjectHistory } from '../../history';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import { resolveVideoCompositionCamera } from '../../../../features/video/composition/motion';
import { resolveVideoCompositionActions } from '../../../../features/video/composition/timeline/frame/actions';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { materializeVideoProjectCursorSourceObservations } from '../../../../features/video/project/cursor-source-observations';
import { resolveCursorSample } from '../../../../features/video/composition/timeline/frame/cursor';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  getMediaClipSourceTime,
  getVideoClipSourceTime,
} from '../../../../features/video/project/timeline/rate';
import { getClipAudioGain } from '../../../../features/video/project/timeline/presentation.gain';
import { updateSourceTimedClipTiming } from '../../operations/source-timed-clips';
import { splitProjectClipsAtTimeWithResult } from './split';
import { trimProjectClipStart, trimProjectClipEnd } from './mutations';

function fixture() {
  const project = createEmptyVideoProject('Playback window', 160, 90);
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 160,
      height: 90,
      duration: 3,
      hasAudio: true,
      audioPeaks: null,
      size: 200,
      mimeType: 'video/webm',
    }
  );
  const raw = createVideoClipFromAsset(project.tracks[0]!.id, asset, 160, 90, 0, { muted: false });
  if (raw.type !== 'VIDEO') throw new Error('Missing video');
  const clip = {
    ...raw,
    id: 'held-video',
    sourceStart: 1,
    sourceDuration: 0.15,
    duration: 5 / 30 / 0.1,
    playbackRate: 0.1,
    fadeInMs: 0,
    fadeOutMs: 1000,
    audioGainStart: 0.2,
    audioGainEnd: 0.8,
    playbackWindow: {
      offset: 0,
      holdAt: 1.5,
      fadePhase: { offset: 0, duration: 1.5 },
      gainPhase: { offset: 0, duration: 1.5 },
    },
  };
  project.version = 43;
  project.assets = [asset];
  project.clips = [clip];
  project.duration = clip.duration;
  return { project, clip };
}

it('retains physical duration and clock metadata through JSON and hydration', () => {
  const { project, clip } = fixture();
  expect(isExportReadyVideoProject(project)).toBe(true);
  const restored = hydrateVideoProject(JSON.parse(JSON.stringify(project)));
  expect(restored.clips[0]).toMatchObject({
    duration: clip.duration,
    sourceStart: 1,
    sourceDuration: 0.15,
    playbackWindow: clip.playbackWindow,
  });
  expect(isExportReadyVideoProject(restored)).toBe(true);
});

it('caps the visual source clock without holding audio time or sampling past the video bound', () => {
  const { clip } = fixture();
  expect(getVideoClipSourceTime(clip, 1.57)).toBeCloseTo(1.15, 12);
  expect(getMediaClipSourceTime(clip, 1.57)).toBeCloseTo(1.157, 12);
  expect(getClipAudioGain(clip, 1.57)).toBe(0);
});

it('keeps a split inside a slowed held tail valid and preserves both bounded source intervals', () => {
  const { project, clip } = fixture();
  const result = splitProjectClipsAtTimeWithResult(project, clip.id, 1.57);
  expect(result).not.toBeNull();
  const first = result!.project.clips.find(({ id }) => id === clip.id)!;
  const second = result!.project.clips.find(({ id }) => id === result!.trailingClipId)!;
  expect(first.duration).toBeCloseTo(1.57, 12);
  expect(second.duration).toBeCloseTo(clip.duration - 1.57, 12);
  for (const part of [first, second]) {
    expect(part).toMatchObject({ sourceStart: 1, sourceDuration: 0.15 });
    expect(part.duration).toBeGreaterThan(0);
  }
  expect(second.playbackWindow).toEqual({
    offset: 1.57,
    extent: clip.duration,
    holdAt: 1.5,
    fadePhase: { offset: 1.57, duration: 1.5 },
    gainPhase: { offset: 1.57, duration: 1.5 },
  });
  if (second.type !== 'VIDEO') throw new Error('Missing trailing video');
  expect(getVideoClipSourceTime(second, second.startTime + 0.02)).toBeCloseTo(1.15, 12);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(result!.project)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(reopened.clips.map(({ duration }) => duration)).toEqual(
    result!.project.clips.map(({ duration }) => duration)
  );
});

it('scales placement and retained phases on rate edits without changing source bounds', () => {
  const { clip } = fixture();
  const next = updateSourceTimedClipTiming(clip, { playbackRate: 0.0625 });
  expect(next.duration).toBeCloseTo(8 / 3, 12);
  expect(next).toMatchObject({
    sourceStart: 1,
    sourceDuration: 0.15,
    playbackWindow: {
      offset: 0,
      holdAt: expect.closeTo(2.4, 12),
      fadePhase: { offset: 0, duration: expect.closeTo(2.4, 12) },
      gainPhase: { offset: 0, duration: expect.closeTo(2.4, 12) },
    },
  });
  expect(next.fadeOutMs).toBeCloseTo(1600, 12);
  expect(getClipAudioGain(next, 1.92)).toBeCloseTo(getClipAudioGain(clip, 1.2), 12);
});

it('preserves a gain ramp and fade phase through a cut before the held tail', () => {
  const { project, clip } = fixture();
  expect(getClipAudioGain(clip, 1.2)).toBeCloseTo(0.204, 12);
  const result = splitProjectClipsAtTimeWithResult(project, clip.id, 0.4)!;
  const second = result.project.clips.find(({ id }) => id === result.trailingClipId)!;
  expect(getClipAudioGain(second, 1.2)).toBeCloseTo(0.204, 12);
});

it('promotes the existing mutation schema and fences playback windows from old readers', () => {
  const { project, clip } = fixture();
  const baseline = { ...project, version: 2 as const, clips: [] };
  const changed = applyVideoProjectMutationPatch(baseline, { clips: [clip] });
  expect(changed.version).toBe(43);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  expect(isExportReadyVideoProject({ ...changed, version: 42 })).toBe(false);
  expect(isExportReadyVideoProject({ ...changed, version: 41 })).toBe(false);
});

it.each([
  null,
  {},
  [],
  { offset: -1 },
  { offset: NaN },
  { offset: 0, extent: 0 },
  { offset: 0, extent: Infinity },
  { offset: 0, extent: 0.1 },
  { offset: 0, holdAt: Infinity },
  { offset: 0, holdAt: -1 },
  { offset: 0, extra: true },
  { offset: 0, fadePhase: { offset: 0, duration: 0 } },
  { offset: 0, gainPhase: { offset: -Infinity, duration: 1 } },
  { offset: 0, fadePhase: { offset: 0, duration: 1, extra: true } },
])('refuses malformed playback-window metadata %# without repairing it', (window) => {
  const { project, clip } = fixture();
  const candidate = { ...project, clips: [{ ...clip, playbackWindow: window }] };
  const before = structuredClone(candidate);
  expect(isExportReadyVideoProject(candidate)).toBe(false);
  expect(candidate).toEqual(before);
});

it('trims and restores a held tail without changing retained source bounds or envelope phases', () => {
  const { project, clip } = fixture();
  const shortened = trimProjectClipEnd(project, clip.id, 1.3);
  expect(shortened.clips[0]!.duration).toBeCloseTo(1.3, 12);
  expect(shortened.clips[0]).toMatchObject({ sourceStart: 1, sourceDuration: 0.15 });
  const restored = trimProjectClipEnd(shortened, clip.id, clip.duration);
  expect(restored.clips[0]!.duration).toBeCloseTo(clip.duration, 12);
  const held = trimProjectClipStart(restored, clip.id, 1.57);
  expect(held.clips[0]).toMatchObject({ sourceStart: 1, sourceDuration: 0.15 });
  expect(held.clips[0]!.duration).toBeCloseTo(clip.duration - 1.57, 12);
  expect(getClipAudioGain(held.clips[0]!, 1.58)).toBe(0);
  const untrimmed = trimProjectClipStart(held, clip.id, 0);
  expect(untrimmed.clips[0]).toMatchObject({ startTime: 0, duration: clip.duration });
  expect(getClipAudioGain(untrimmed.clips[0]!, 1.2)).toBeCloseTo(0.204, 12);
  expect(isExportReadyVideoProject(hydrateVideoProject(JSON.parse(JSON.stringify(held))))).toBe(
    true
  );
});

it('restores a trimmed edge after inspector fade and gain edits without invalidating either phase', () => {
  const { project, clip } = fixture();
  const trimmed = trimProjectClipStart(project, clip.id, 0.4);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(trimmed);
  store.getState().updateClipFades(clip.id, { fadeOutMs: 100 });
  store.getState().updateClipVolume(clip.id, 0.4);
  const restored = trimProjectClipStart(store.getState().project!, clip.id, 0);
  expect(isExportReadyVideoProject(restored)).toBe(true);
  expect(restored.clips[0]!.playbackWindow).toMatchObject({
    offset: 0,
    fadePhase: { offset: -0.4, duration: expect.closeTo(clip.duration - 0.4, 12) },
    gainPhase: { offset: -0.4, duration: expect.closeTo(clip.duration - 0.4, 12) },
  });
  expect(getClipAudioGain(restored.clips[0]!, 1.2)).toBeCloseTo(0.4, 12);
});

it('retains captured cursor position through a held-tail split, inspector rate edit and reopen', () => {
  const { project, clip } = fixture();
  clip.sourceInstanceId = 'captured-instance';
  project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'source',
    originRecordingId: 'recording',
  };
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'captured-instance',
        samples: [
          { id: 'a', time: 1, x: 16, y: 9, visible: true, recordingPoint: { x: 0.1, y: 0.1 } },
          { id: 'b', time: 1.15, x: 144, y: 81, visible: true, recordingPoint: { x: 0.9, y: 0.9 } },
        ],
      },
    ],
  };
  project.cursorTrack = materializeVideoProjectCursorSourceObservations(project);
  expect(isExportReadyVideoProject(project)).toBe(true);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().splitClipAt(clip.id, 1.57);
  const split = store.getState().project!;
  expect(split.clips).toHaveLength(2);
  expect(isExportReadyVideoProject(split)).toBe(true);
  const trailing = split.clips.find((c) => c.id !== clip.id)!;
  store.getState().updateClipPlaybackRate(trailing.id, 0.0625);
  const edited = store.getState().project!;
  const tail = edited.clips.find((c) => c.id === trailing.id)!;
  expect(tail.type === 'VIDEO' && tail.playbackRate).toBe(0.0625);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(edited)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(
    resolveCursorSample(reopened, tail.startTime + tail.duration / 2, tail.id)?.recordingPoint
  ).toEqual({ x: 0.9, y: 0.9 });
  expect(reopened.cursorTrack!.sourceObservations).toEqual(project.cursorTrack!.sourceObservations);
});

it('retains a captured action phase through Native split, inspector rate edit and reopen', () => {
  const { project, clip } = fixture();
  clip.sourceInstanceId = 'captured-instance';
  clip.playbackWindow.holdAt = 1.3;
  project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'source',
    originRecordingId: 'recording',
  };
  project.actionEvents = [
    {
      id: 'captured-click',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      capturedDuration: 0,
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: 'captured-instance',
        sourceEventId: 'captured-click',
        sourceTime: 1.12,
      },
    },
  ];
  const facts = structuredClone(project.actionEvents);
  const { playbackWindow: _window, ...unheld } = clip;
  const reference = {
    ...project,
    duration: 2.4,
    clips: [updateSourceTimedClipTiming(unheld, { playbackRate: 0.0625 })],
  };
  const expected = resolveVideoCompositionActions(reference, 2.08);
  expect(expected).toHaveLength(1);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().splitClipAt(clip.id, 1.57);
  const split = store.getState().project!;
  const trailing = split.clips.find((item) => item.id !== clip.id)!;
  store.getState().updateClipPlaybackRate(trailing.id, 0.0625);
  const edited = store.getState().project!;
  const tail = edited.clips.find((item) => item.id === trailing.id)!;
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(edited)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  const held = resolveVideoCompositionActions(reopened, tail.startTime + tail.duration / 2);
  expect(held).toHaveLength(1);
  expect(held[0]!.clipId).toBe(tail.id);
  expect(held[0]!.progress).toBeCloseTo(expected[0]!.progress, 12);
  expect(reopened.actionEvents).toEqual(facts);
});

it.each([true, false])(
  'keeps a retained camera connection through Native split/reopen with an existing source identity=%s',
  (identity) => {
    const { project, clip } = fixture();
    if (identity) clip.sourceInstanceId = 'camera-source';
    clip.playbackWindow.holdAt = 1.3;
    const first = bindMotionRegionToClip(
      {
        ...createVideoProjectMotionRegion(project, 0),
        id: 'before-gap',
        duration: 0.8,
        scale: 2,
        zoomInDuration: 0,
        zoomOutDuration: 0,
      },
      clip
    );
    const second = bindMotionRegionToClip(
      {
        ...createVideoProjectMotionRegion(project, 1.4),
        id: 'after-gap',
        duration: 0.1,
        scale: 1.5,
        zoomInDuration: 0,
        zoomOutDuration: 0,
        incomingConnection: { fromRegionId: first.id, easing: 'LINEAR' },
      },
      clip
    );
    project.motionRegions = [first, second];
    const { playbackWindow: _window, ...unheld } = clip;
    const reference = { ...project, clips: [updateSourceTimedClipTiming(unheld, {})] };
    const expected = resolveVideoCompositionCamera({
      project: reference,
      currentTime: 1.3,
      actions: [],
      cursorSample: null,
    });
    expect(expected.scale).toBeGreaterThan(1.5);
    const store = createVideoEditorProjectTestStore();
    store.getState().setProject(project);
    store.getState().splitClipAt(clip.id, 1.57);
    const split = store.getState().project!;
    expect(split.clips).toHaveLength(2);
    const tail = split.clips.find((item) => item.id !== clip.id)!;
    expect(
      split.motionRegions!.some(
        (region) => region.sourceBinding?.clipId === tail.id && region.duration > 0
      )
    ).toBe(false);
    const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(split)));
    const actual = resolveVideoCompositionCamera({
      project: reopened,
      currentTime: 1.6,
      actions: [],
      cursorSample: null,
    });
    expect(actual.scale).toBeCloseTo(expected.scale, 12);
    expect(actual.viewportX).toBeCloseTo(expected.viewportX, 9);
  }
);

it('reopens an empty retained media window and restores its complete subframe source without a new model', () => {
  const { project, clip } = fixture();
  const retained = {
    ...clip,
    startTime: 1,
    duration: 0,
    sourceDuration: 0.005,
    playbackRate: 2,
    playbackWindow: { offset: 0, extent: 0.0025 },
  };
  project.clips = [retained];
  project.duration = 1;
  expect(isExportReadyVideoProject(project)).toBe(true);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(project)));
  expect(reopened.clips[0]).toMatchObject({
    ...retained,
    volumeEnvelopeStart: 0.2,
    volumeEnvelopeEnd: 0.8,
  });
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(reopened);
  store.getState().trimClipEnd(clip.id, 1.0025);
  const restored = store.getState().project!;
  expect(restored.clips[0]).toMatchObject({
    duration: 0.0025,
    sourceStart: 1,
    sourceDuration: 0.005,
    playbackRate: 2,
  });
  expect(isExportReadyVideoProject(restored)).toBe(true);
  const undone = undoVideoEditorProjectHistory(store.getState().projectHistory, restored);
  expect(undone?.status).toBe('applied');
  if (!undone || undone.status !== 'applied') throw new Error('Expected undo');
  expect(undone.project.clips).toEqual(reopened.clips);
});

it.each([{ offset: 0 }, { offset: 0, extent: 0 }, { offset: 0, extent: -1 }])(
  'refuses an empty window without a positive retained extent %j',
  (playbackWindow) => {
    const { project, clip } = fixture();
    project.clips = [{ ...clip, duration: 0, playbackWindow }];
    expect(isExportReadyVideoProject(project)).toBe(false);
  }
);

it('keeps camera move and resize on the retained source clock after a window split', () => {
  const { project, clip } = fixture();
  Object.assign(clip, {
    sourceStart: 2,
    sourceDuration: 4,
    duration: 4.01,
    playbackRate: 1,
    playbackWindow: { offset: 0, extent: 4.01, holdAt: 3.99 },
  });
  project.assets[0]!.metadata.duration = 8;
  project.duration = clip.duration;
  project.motionRegions = [
    bindMotionRegionToClip(
      { ...createVideoProjectMotionRegion(project, 2.25), duration: 0.5 },
      clip
    ),
  ];
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().splitClipAt(clip.id, 2);
  const split = store.getState().project!;
  const region = split.motionRegions!.find((item) => item.duration > 0)!;
  expect(region.sourceBinding?.clipId).not.toBe(clip.id);
  store.getState().updateMotionRegion(region.id, { startTime: 2.5 });
  const moved = store.getState().project!.motionRegions!.find((item) => item.id === region.id)!;
  expect(moved).toMatchObject({
    startTime: 2.5,
    duration: 0.5,
    sourceBinding: { sourceStart: 4.5, sourceEnd: 5 },
  });
  store.getState().updateMotionRegion(region.id, { startTime: 2.375, duration: 0.75 });
  const resized = store.getState().project!;
  expect(resized.motionRegions!.find((item) => item.id === region.id)).toMatchObject({
    startTime: 2.375,
    duration: 0.75,
    sourceBinding: { sourceStart: 4.375, sourceEnd: 5.125 },
  });
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(resized)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(reopened.motionRegions).toEqual(resized.motionRegions);
});
