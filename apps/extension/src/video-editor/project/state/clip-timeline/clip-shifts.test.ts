import { describe, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../../../../features/video/project/factories/recording';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { createShiftedClipStartPatch } from './clip-shifts';

describe('clip shift EffectV1 ownership', () => {
  it('returns only shifted clips when the project has no effect branch', () => {
    const project = createProject();
    Reflect.deleteProperty(project, 'effectInstances');

    const patch = createShiftedClipStartPatch({
      clipIds: new Set([project.clips[0]!.id]),
      delta: 2,
      project,
    });

    expect(patch.clips[0]!.startTime).toBe(3);
    expect(patch).not.toHaveProperty('effectInstances');
  });
});

describe('clip shift EffectV1 timing', () => {
  it('moves only clip-target instances by the exact clamped clip delta', () => {
    const project = createProject();
    const [shiftedClip, stableClip] = project.clips;
    project.effectInstances = [
      createInstance('shifted', 0.25, { clipId: shiftedClip!.id, kind: 'clip' }),
      createInstance('stable', 4, { clipId: stableClip!.id, kind: 'clip' }),
      createInstance('scene', 1, { kind: 'scene' }),
    ];

    const patch = createShiftedClipStartPatch({
      clipIds: new Set([shiftedClip!.id]),
      delta: -5,
      project,
    });

    expect(patch.clips[0]!.startTime).toBe(0);
    expect(patch.effectInstances).toEqual([
      expect.objectContaining({ id: 'shifted', startTime: 0 }),
      expect.objectContaining({ id: 'stable', startTime: 4 }),
      expect.objectContaining({ id: 'scene', startTime: 1 }),
    ]);
  });

  it('supports the caller-owned clip updater without changing unrelated clips', () => {
    const project = createProject();
    const updateClip = vi.fn((clip: VideoProjectClip, startTime: number) => ({
      ...clip,
      name: 'updated',
      startTime,
    }));

    const patch = createShiftedClipStartPatch({
      clipIds: new Set([project.clips[0]!.id]),
      delta: 1,
      project,
      updateClip,
    });

    expect(updateClip).toHaveBeenCalledOnce();
    expect(patch.clips[0]).toEqual(expect.objectContaining({ name: 'updated', startTime: 2 }));
    expect(patch.clips[1]).toBe(project.clips[1]);
  });
});

function createProject(): VideoProject {
  const project = createEmptyVideoProject('clip-shifts');
  const asset = createRecordingProjectAsset({
    duration: 10,
    filename: 'recording.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording',
    size: 1,
    width: 1280,
  });
  const trackId = project.tracks[0]!.id;
  const first = createRecordingBaseClip(
    asset,
    { duration: 3, height: 720, width: 1280 },
    trackId,
    null
  );
  const second = createRecordingBaseClip(
    asset,
    { duration: 3, height: 720, width: 1280 },
    trackId,
    null
  );
  first.startTime = 1;
  second.startTime = 5;
  return { ...project, assets: [asset], clips: [first, second] };
}

function createInstance(
  id: string,
  startTime: number,
  target: NonNullable<VideoProject['effectInstances']>[number]['target']
) {
  return {
    controls: {},
    duration: 1,
    enabled: true,
    id,
    kind: target.kind === 'scene' ? 'standalone' : 'targetEffect',
    playbackRate: 1,
    snapshotId: `snapshot-${id}`,
    startTime,
    target,
  } satisfies NonNullable<VideoProject['effectInstances']>[number];
}
