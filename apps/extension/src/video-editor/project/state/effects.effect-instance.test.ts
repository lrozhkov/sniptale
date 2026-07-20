import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VideoProject } from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import {
  createApplyArgs,
  createProjectWithEffects,
  createStoreWithEffects,
} from './effects.effect-instance.test-support';
import {
  duplicateStandaloneEffectHost,
  splitStandaloneEffectHost,
} from './clip-timeline/effect-host';

const applyEffectCatalogDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('../../../features/video/project/effect-instance/apply', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/project/effect-instance/apply')
  >()),
  applyEffectCatalogDocument: applyEffectCatalogDocumentMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor EffectV1 instance mutations', () => {
  it('moves, resizes, and retimes a standalone instance through its ordinary clip host', () => {
    const store = createStoreWithEffects();
    const host = store
      .getState()
      .project!.clips.find(
        (clip) => 'effectInstanceId' in clip && clip.effectInstanceId === 'scene-a'
      )!;

    store.getState().updateClipTransform(host.id, { width: 444, x: 321 });
    store.getState().moveClip(host.id, 0);
    store.getState().trimClipEnd(host.id, 4);

    const nextHost = store.getState().project!.clips.find(({ id }) => id === host.id)!;
    const instance = store.getState().project!.effectInstances!.find(({ id }) => id === 'scene-a')!;
    expect(nextHost).toMatchObject({
      duration: 4,
      startTime: 0,
      transform: expect.objectContaining({ width: 444, x: 321 }),
    });
    expect(instance).toMatchObject({ duration: 4, playbackRate: 0.5, startTime: 0 });
  });
});

describe('editor EffectV1 instance lifecycle mutations', () => {
  it('deletes instances and retains only snapshots that still have consumers', () => {
    const store = createStoreWithEffects();

    store.getState().deleteEffectInstance('missing');
    expect(store.getState().project?.effectInstances).toHaveLength(4);
    store.getState().deleteEffectInstance('scene-a');
    expect(store.getState().project?.effectSnapshots?.map(({ id }) => id)).toContain('snapshot-a');
    store.getState().deleteEffectInstance('scene-b');

    expect(store.getState().project?.effectSnapshots?.map(({ id }) => id)).not.toContain(
      'snapshot-a'
    );
  });

  it('duplicates non-transition instances immediately after their source', () => {
    const store = createStoreWithEffects();

    expect(store.getState().duplicateEffectInstance('missing')).toBeNull();
    expect(store.getState().duplicateEffectInstance('transition')).toBeNull();
    const duplicateId = store.getState().duplicateEffectInstance('scene-a');
    const instances = store.getState().project!.effectInstances!;

    expect(duplicateId).toEqual(expect.any(String));
    expect(instances.map(({ id }) => id).slice(0, 2)).toEqual(['scene-a', duplicateId]);
    expect(instances[1]).toEqual(
      expect.objectContaining({ controls: { accent: 1 }, startTime: 3 })
    );
    expect(instances[1]!.controls).not.toBe(instances[0]!.controls);
  });
});

describe('editor standalone EffectV1 host clip lifecycle', () => {
  it('duplicates and splits hosts with matching instance timing authority', () => {
    const project = createProjectWithEffects();
    const host = project.clips.find(
      (clip) => 'effectInstanceId' in clip && clip.effectInstanceId === 'scene-a'
    )!;

    const duplicated = duplicateStandaloneEffectHost(project, host.id);
    expect(duplicated).not.toBeNull();
    expect(
      duplicated?.project.effectInstances?.find(({ id }) => id === duplicated.effectInstanceId)
    ).toEqual(expect.objectContaining({ startTime: host.startTime + 0.25 }));

    const split = splitStandaloneEffectHost(project, host.id, host.startTime + 1);
    expect(split).not.toBeNull();
    const splitHosts = split!.clips.filter(
      (clip) => clip.type === 'EFFECT' && clip.startTime >= host.startTime && clip.startTime < 3
    );
    expect(splitHosts).toHaveLength(2);
    for (const splitHost of splitHosts) {
      if (splitHost.type !== 'EFFECT') throw new Error('Expected EffectV1 host');
      expect(split!.effectInstances?.find(({ id }) => id === splitHost.effectInstanceId)).toEqual(
        expect.objectContaining({ duration: splitHost.duration, startTime: splitHost.startTime })
      );
    }
  });

  it('rejects missing hosts, missing instance authority, and boundary-adjacent splits', () => {
    const project = createProjectWithEffects();
    const host = project.clips.find(
      (clip) => 'effectInstanceId' in clip && clip.effectInstanceId === 'scene-a'
    )!;
    const withoutInstance = {
      ...project,
      effectInstances: project.effectInstances!.filter(({ id }) => id !== 'scene-a'),
    };

    expect(duplicateStandaloneEffectHost(project, 'missing')).toBeNull();
    expect(splitStandaloneEffectHost(project, 'missing', 2)).toBeNull();
    expect(duplicateStandaloneEffectHost(withoutInstance, host.id)).toBeNull();
    expect(splitStandaloneEffectHost(withoutInstance, host.id, 2)).toBeNull();
    expect(splitStandaloneEffectHost(project, host.id, host.startTime + 0.01)).toBe(project);
  });
});

describe('editor EffectV1 instance ordering and updates', () => {
  it('reorders only instances that share the same semantic target', () => {
    const store = createStoreWithEffects();

    store.getState().moveEffectInstance('missing', 'down');
    store.getState().moveEffectInstance('scene-a', 'down');
    expect(store.getState().project?.effectInstances?.map(({ id }) => id)).toEqual([
      'scene-b',
      'clip',
      'scene-a',
      'transition',
    ]);
    store.getState().moveEffectInstance('scene-b', 'up');
    expect(store.getState().project?.effectInstances?.[0]?.id).toBe('scene-b');
  });

  it('merges controls and clamps editable timing without moving transitions', () => {
    const store = createStoreWithEffects();

    store.getState().updateEffectInstance('scene-a', {
      controls: { accent: 2, omitted: undefined },
      enabled: false,
      startTime: -5,
    });
    store.getState().updateEffectInstance('transition', { startTime: 99 });
    store.getState().updateEffectInstance('missing', { enabled: false });

    expect(store.getState().project?.effectInstances?.find(({ id }) => id === 'scene-a')).toEqual(
      expect.objectContaining({ controls: { accent: 2 }, enabled: false, startTime: 1 })
    );
    expect(
      store.getState().project?.effectInstances?.find(({ id }) => id === 'transition')?.startTime
    ).toBe(4);
  });
});

describe('editor EffectV1 async apply authority', () => {
  it('returns null without a project and commits against the unchanged source project', async () => {
    const store = createVideoEditorProjectTestStore();
    const args = createApplyArgs();

    await expect(store.getState().applyEffectDocument(args)).resolves.toBeNull();
    expect(applyEffectCatalogDocumentMock).not.toHaveBeenCalled();

    store.getState().setProject(createProjectWithEffects());
    applyEffectCatalogDocumentMock.mockImplementationOnce(
      async ({ project }: { project: VideoProject }) => ({ ...project, name: 'applied' })
    );
    await expect(store.getState().applyEffectDocument(args)).resolves.toEqual(expect.any(String));
    expect(store.getState().project?.name).toBe('applied');
  });

  it('discards a stale async result after project authority changes', async () => {
    const store = createStoreWithEffects();
    const sourceProject = store.getState().project!;
    let resolveApply: ((project: VideoProject) => void) | undefined;
    applyEffectCatalogDocumentMock.mockImplementationOnce(
      () =>
        new Promise<VideoProject>((resolve) => {
          resolveApply = resolve;
        })
    );

    const result = store.getState().applyEffectDocument(createApplyArgs());
    store.getState().setProject({ ...sourceProject, name: 'replacement' });
    resolveApply?.({ ...sourceProject, name: 'late-result' });

    await expect(result).resolves.toBeNull();
    expect(store.getState().project?.name).toBe('replacement');
  });
});
