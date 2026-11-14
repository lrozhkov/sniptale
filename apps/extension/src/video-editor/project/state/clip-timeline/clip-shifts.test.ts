import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
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
  it('moves only the shifted host annotation clock by the exact clamped host delta', () => {
    const project = createProject();
    const moving = createInstance('shifted', 1, { kind: 'scene' });
    const stable = createInstance('stable', 4, { kind: 'scene' });
    const hosts = [moving, stable].map((instance) =>
      createEffectHostClip({
        duration: instance.duration,
        effectInstanceId: instance.id,
        name: instance.id,
        projectHeight: project.height,
        projectWidth: project.width,
        startTime: instance.startTime,
        trackId: project.tracks[0]!.id,
      })
    );
    project.clips.push(...hosts);
    project.effectInstances = [moving, stable];
    const patch = createShiftedClipStartPatch({
      clipIds: new Set([hosts[0]!.id]),
      delta: -5,
      project,
    });
    expect(patch.clips.find((clip) => clip.id === hosts[0]!.id)?.startTime).toBe(0);
    expect(patch.effectInstances).toEqual([{ ...moving, startTime: 0 }, stable]);
    expect(project.effectInstances).toEqual([moving, stable]);
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
    kind: 'standalone',
    playbackRate: 1,
    snapshotId: `snapshot-${id}`,
    startTime,
    target,
  } satisfies NonNullable<VideoProject['effectInstances']>[number];
}
