import { createStore } from 'zustand/vanilla';
import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import {
  VideoCursorCaptureMode,
  VideoTemporalEasing,
  type VideoProject,
  type VideoProjectCursorSample,
} from '../../../../features/video/project/types';
import { resolveVideoCompositionCursor } from '../../../../features/video/composition/timeline/frame/cursor';
import { createVideoEditorProjectActions } from '../actions';
import type { VideoEditorProjectState } from '../contracts';
import { resetVideoEditorProjectHistory } from '../../history';

function setup(
  source: boolean,
  captureMode: VideoCursorCaptureMode,
  easing: VideoTemporalEasing,
  keyTimes = [0, 6]
) {
  const project = createEmptyVideoProject('Cursor montage');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    source
      ? { kind: 'recording', recordingId: 'recording' }
      : { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 1280,
      height: 720,
      duration: 6,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const store = createStore<VideoEditorProjectState>()((set, get) => ({
    project,
    currentTime: 3,
    placementMode: null,
    selection: { kind: 'scene' },
    selectedTrackId: null,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    ...createVideoEditorProjectActions(set, get),
  }));
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  const clipId = base.clips[0]!.id;
  const samples: VideoProjectCursorSample[] = keyTimes.map((time) => ({
    id: `key-${time}`,
    time,
    x: time * 100,
    y: time * 50,
    visible: true,
    interpolation: easing,
    ...(time === 0
      ? {
          skinOverride: normalizeVideoProjectCursorSkin({
            preset: 'DOT',
            color: '#22c55e',
            scale: 2,
          }),
        }
      : {}),
    ...(source
      ? {
          sourceAnchor: {
            kind: 'recording-source' as const,
            recordingId: 'recording',
            sourceClipId: clipId,
            sourceTime: time,
          },
        }
      : { timeBasis: 'project' as const }),
  }));
  store.setState({
    project: {
      ...base,
      cursorTrack: { captureMode, samples, skin: normalizeVideoProjectCursorSkin(undefined) },
    },
  });
  return { store, asset, clipId };
}

function expectPosition(
  project: VideoProject,
  time: number,
  original: VideoProject,
  originalTime: number
) {
  const cursor = resolveVideoCompositionCursor(project, time, []);
  const expected = resolveVideoCompositionCursor(original, originalTime, []);
  expect(cursor).not.toBeNull();
  expect(expected).not.toBeNull();
  expect(cursor!.x).toBeCloseTo(expected!.x, 8);
  expect(cursor!.y).toBeCloseTo(expected!.y, 8);
  expect(cursor!.preset).toBe(expected!.preset);
  expect(cursor!.color).toBe(expected!.color);
  expect(cursor!.scale).toBe(expected!.scale);
}

for (const source of [false, true])
  for (const mode of Object.values(VideoCursorCaptureMode)) {
    it.each(Object.values(VideoTemporalEasing))(
      `preserves ${source ? 'source' : 'manual'} cursor curve in ${mode} with %s through repeated insert`,
      (easing) => {
        const { store, asset } = setup(source, mode, easing);
        const before = store.getState().project!;
        expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
        const after = hydrateVideoProject(store.getState().project!);
        for (const time of [0, 0.5, 2.5, 2.999, 3, 3.1, 4.5, 5.999])
          expectPosition(after, time < 3 ? time : time + 6, before, time);
        for (const time of [3, 5, 8.999])
          expect(resolveVideoCompositionCursor(after, time, [])).toBeNull();
        store.setState({ currentTime: 10 });
        expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
        const repeated = hydrateVideoProject(store.getState().project!);
        for (const time of [4, 4.5, 5.999]) expectPosition(repeated, time + 12, before, time);
        for (const time of [10, 13, 15.999])
          expect(resolveVideoCompositionCursor(repeated, time, [])).toBeNull();
      }
    );
  }

it.each([false, true])(
  'preserves exact-key insertion and source clip lifetime (source=%s)',
  (source) => {
    const { store, asset, clipId } = setup(source, 'separate', 'EASE_IN_OUT', [0, 3, 6]);
    const before = store.getState().project!;
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const after = hydrateVideoProject(store.getState().project!);
    for (const time of [1, 2.9, 3, 4, 5.9])
      expectPosition(after, time < 3 ? time : time + 6, before, time);
    expect(resolveVideoCompositionCursor(after, 6, [])).toBeNull();
    if (source) {
      store.getState().deleteClip(clipId);
      expectPosition(store.getState().project!, 10, before, 4);
      const tail = store.getState().project!.clips.find((clip) => clip.startTime === 9)!;
      store.getState().moveClip(tail.id, 30);
      expectPosition(store.getState().project!, 31, before, 4);
      expect(resolveVideoCompositionCursor(store.getState().project!, 33, [])).toBeNull();
    }
  }
);

it('does not steal cursor anchors when a second insert cuts another use at the same source time', () => {
  const { store, asset } = setup(true, 'separate', 'EASE_IN_OUT');
  const before = store.getState().project!;
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  store.setState({ currentTime: 6 });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  for (const time of [0.5, 2, 2.999]) expectPosition(after, time, before, time);
  for (const time of [3, 6, 9, 12, 14.999])
    expect(resolveVideoCompositionCursor(after, time, [])).toBeNull();
  for (const time of [3, 4, 5.9]) expectPosition(after, time + 12, before, time);
});

for (const source of [false, true]) {
  it.each([0, 6])(
    `preserves boundary insertion without cursor leakage (source=${source}, cut=%s)`,
    (cut) => {
      const { store, asset } = setup(source, 'separate', 'EASE_OUT');
      store.setState({ currentTime: cut });
      const before = store.getState().project!;
      expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
      const after = hydrateVideoProject(store.getState().project!);
      for (const time of [0.5, 2, 5.9])
        expectPosition(after, time < cut ? time : time + 6, before, time);
      for (const time of [cut, cut + 3, cut + 5.999])
        expect(resolveVideoCompositionCursor(after, time, [])).toBeNull();
    }
  );
  it(`preserves held cursor state when there is no following key (source=${source})`, () => {
    const { store, asset } = setup(source, 'separate', 'EASE_OUT', [0]);
    const before = store.getState().project!;
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const after = hydrateVideoProject(store.getState().project!);
    expectPosition(after, 2, before, 2);
    expectPosition(after, 10, before, 4);
    expect(resolveVideoCompositionCursor(after, 6, [])).toBeNull();
    if (source) expect(resolveVideoCompositionCursor(after, 12, [])).toBeNull();
  });
}

it('maps cursor boundaries to the source clock at double speed and restores original keys on undo', async () => {
  const { undoVideoEditorProjectHistory } = await import('../../history');
  const { store, asset } = setup(true, 'separate', 'EASE_IN_OUT');
  const base = store.getState().project!;
  store.setState({
    currentTime: 1.5,
    project: {
      ...base,
      clips: base.clips.map((clip) => ({ ...clip, playbackRate: 2, duration: 3 })),
      cursorTrack: {
        ...base.cursorTrack!,
        samples: base.cursorTrack!.samples.map((sample) => ({ ...sample, time: sample.time / 2 })),
      },
    },
  });
  const before = store.getState().project!;
  const originalKeys = structuredClone(before.cursorTrack);
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const after = hydrateVideoProject(store.getState().project!);
  expectPosition(after, 1, before, 1);
  expectPosition(after, 8, before, 2);
  expect(
    after.cursorTrack!.samples.find((sample) => sample.time === 7.5)?.sourceAnchor?.sourceTime
  ).toBe(3);
  expect(resolveVideoCompositionCursor(after, 5, [])).toBeNull();
  const state = store.getState();
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status === 'applied') expect(undo.project.cursorTrack).toEqual(originalKeys);
});
