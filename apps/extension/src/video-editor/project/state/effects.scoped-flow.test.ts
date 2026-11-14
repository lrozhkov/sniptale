import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import { expect, it } from 'vitest';
import { readValidAnimationCatalog } from '../../../composition/persistence/effect-bundles/fixture.test-support';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation';
import { applyEffectCatalogDocument } from '../../../features/video/project/effect-instance/apply';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

it('retains scene animation timing, editable content, anchors and duplicates through history and reload', async () => {
  const catalog = await readValidAnimationCatalog();
  const store = createVideoEditorProjectTestStore();
  const project = createEmptyVideoProject('Animation history');
  const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
  clip.duration = 20;
  project.clips = [clip];
  const overlay = { ...project.tracks[0]!, id: 'animation-track', order: 1 };
  project.tracks.push(overlay);
  store.getState().setProject(project);
  const id = await store.getState().applyEffectDocument({
    catalog,
    documentId: catalog.documents[0]!.id,
    startTime: 0,
    target: { kind: 'scene' },
    trackId: overlay.id,
  });
  if (!id) throw Error('Animation not applied');
  const original = store.getState().project!;
  const host = original.clips.find(
    (item) => item.type === 'EFFECT' && item.effectInstanceId === id
  )!;
  store.getState().moveClip(host.id, 2);
  store.getState().updateEffectInstance(id, { controls: { title: 'Edited' } });
  store.getState().moveClip(host.id, 4);
  const state = store.getState();
  const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undone?.status !== 'applied') throw Error('No undo');
  expect(undone.project.effectInstances![0]).toMatchObject({
    startTime: 2,
    duration: 3,
    controls: { title: 'Edited' },
  });
  const redone = redoVideoEditorProjectHistory(undone.history, undone.project);
  if (redone?.status !== 'applied') throw Error('No redo');
  const saved = parseHydratableVideoProject(JSON.parse(JSON.stringify(redone.project)));
  if (!saved) throw Error('Invalid restored animation');
  expect(saved.effectSnapshots![0]!.source).toBe(original.effectSnapshots![0]!.source);
  expect(saved.effectInstances![0]!.sceneAnchors).toEqual(
    original.effectInstances![0]!.sceneAnchors
  );
  store.getState().setProject(saved);
  const copy = store.getState().duplicateEffectInstance(id);
  expect(copy).not.toBeNull();
  expect(store.getState().project!.effectInstances!.find((item) => item.id === copy)).toMatchObject(
    {
      startTime: 7,
      duration: 3,
      controls: { title: 'Edited' },
      sceneAnchors: saved.effectInstances![0]!.sceneAnchors,
    }
  );
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(store.getState().project)))
  ).not.toBeNull();
});
it.each(['clip', 'track', 'video-group', 'transition'] as const)(
  'refuses retired %s effect targets without changing the input project',
  async (kind) => {
    const project = createEmptyVideoProject('Unchanged');
    const before = structuredClone(project),
      catalog = await readValidAnimationCatalog();
    const target =
      kind === 'clip'
        ? { kind, clipId: 'clip' }
        : kind === 'track'
          ? { kind, trackId: 'track' }
          : kind === 'transition'
            ? { kind, transitionId: 'transition' }
            : { kind };
    await expect(
      applyEffectCatalogDocument({
        project,
        catalog,
        documentId: catalog.documents[0]!.id,
        instanceId: 'refused',
        startTime: 0,
        target,
      })
    ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
    expect(project).toEqual(before);
  }
);
