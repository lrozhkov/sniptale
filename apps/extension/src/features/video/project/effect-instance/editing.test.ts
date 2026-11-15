import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createEffectHostClip } from '../factories/overlay-clip';
import { isEffectInstanceEditable } from './editing';
import { reconcileVideoProjectEffectInstances } from './reconcile';
import type { VideoProjectEffectInstance } from './types';
function fixture() {
  const project = createEmptyVideoProject('Animation hosts');
  const instance: VideoProjectEffectInstance = {
    id: 'fx',
    snapshotId: 's',
    controls: {},
    enabled: true,
    kind: 'standalone',
    target: { kind: 'scene' },
    startTime: 12,
    duration: 4,
    playbackRate: 0.5,
    sourceStart: 1,
  };
  const host = createEffectHostClip({
    duration: 4,
    effectInstanceId: instance.id,
    name: 'Annotation',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 12,
    trackId: project.tracks[0]!.id,
  });
  project.clips = [host];
  project.effectInstances = [instance];
  return { project, instance, host };
}
it('uses the host for move and duration while retaining the source phase', () => {
  const { project, host } = fixture();
  host.startTime = 20;
  host.duration = 8;
  const next = reconcileVideoProjectEffectInstances(project).effectInstances![0]!;
  expect(next).toMatchObject({ startTime: 20, duration: 8, playbackRate: 0.25, sourceStart: 1 });
});
it('keeps a held host clock without stretching the retained document interval', () => {
  const { project, host, instance } = fixture();
  host.startTime = 14;
  host.duration = 9;
  host.playbackWindow = { offset: 1, holdAt: 2 };
  const next = reconcileVideoProjectEffectInstances(project).effectInstances![0]!;
  expect(next).toEqual({ ...instance, startTime: 14 });
});
it('refuses missing, duplicate and locked host ownership', () => {
  const { project, host, instance } = fixture();
  expect(isEffectInstanceEditable(project, instance)).toBe(true);
  project.tracks[0]!.locked = true;
  expect(isEffectInstanceEditable(project, instance)).toBe(false);
  project.tracks[0]!.locked = false;
  project.clips.push({ ...host, id: 'duplicate' });
  expect(isEffectInstanceEditable(project, instance)).toBe(false);
  project.clips = [];
  expect(isEffectInstanceEditable(project, instance)).toBe(false);
  expect(reconcileVideoProjectEffectInstances(project).effectInstances).toEqual([]);
});
it.each(['targetEffect', 'transition'])(
  'refuses retired %s even with an otherwise matching host',
  (kind) => {
    const { project, instance } = fixture();
    Reflect.set(instance, 'kind', kind);
    expect(isEffectInstanceEditable(project, instance)).toBe(false);
    expect(reconcileVideoProjectEffectInstances(project).effectInstances).toEqual([]);
  }
);
