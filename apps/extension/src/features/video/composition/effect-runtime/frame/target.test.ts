import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import type { VideoProjectEffectInstance } from '../../../project/effect-instance/types';
import { resolveEffectRuntimeFrameTarget } from './target';
it('resolves the annotation host geometry and its half-open visible interval', () => {
  const project = createEmptyVideoProject('Annotation geometry');
  const instance: VideoProjectEffectInstance = {
    id: 'fx',
    kind: 'standalone',
    playbackRate: 1,
    snapshotId: 's',
    controls: {},
    startTime: 1,
    duration: 2,
    enabled: true,
    target: { kind: 'scene' },
  };
  const host = createEffectHostClip({
    duration: 2,
    effectInstanceId: 'fx',
    name: 'Annotation',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 1,
    trackId: project.tracks[0]!.id,
  });
  project.clips = [host];
  expect(resolveEffectRuntimeFrameTarget(project, instance, 0)).toBeNull();
  expect(resolveEffectRuntimeFrameTarget(project, instance, 1)).toMatchObject({
    kind: 'scene',
    clipId: host.id,
    placement: {
      x: host.transform.x,
      y: host.transform.y,
      width: host.transform.width,
      height: host.transform.height,
      rotation: host.transform.rotation,
      opacity: host.transform.opacity,
    },
  });
  expect(resolveEffectRuntimeFrameTarget(project, instance, 3)).toBeNull();
  project.tracks[0]!.visible = false;
  expect(resolveEffectRuntimeFrameTarget(project, instance, 1)).toBeNull();
  project.clips = [];
  expect(resolveEffectRuntimeFrameTarget(project, instance, 1)).toBeUndefined();
});
it.each(['targetEffect', 'transition'])('does not resolve retired %s frame targets', (kind) => {
  const project = createEmptyVideoProject('Retired target');
  const instance: VideoProjectEffectInstance = {
    id: 'fx',
    kind: 'standalone',
    playbackRate: 1,
    snapshotId: 's',
    controls: {},
    startTime: 0,
    duration: 2,
    enabled: true,
    target: { kind: 'scene' },
  };
  Reflect.set(instance, 'kind', kind);
  expect(resolveEffectRuntimeFrameTarget(project, instance, 1)).toBeUndefined();
});
