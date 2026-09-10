import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createEffectCatalogEntry } from '../../../composition/persistence/effect-bundles/catalog-builder';
import { importRawEffectDocument } from '../../../features/video/project/effect-bundle/import/zip';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import { parseHydratableVideoProject } from '../../../features/video/project/validation';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

async function catalog(kind: 'target-effect' | 'transition') {
  const imported = await importRawEffectDocument(
    new Uint8Array(
      readFileSync(
        `packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-${kind}.sniptale-effect.json`
      )
    )
  );
  if (!imported.ok) throw new Error('Invalid fixture');
  return createEffectCatalogEntry({ document: imported.artifact, kind: 'raw-json' }, 1);
}
function fixture() {
  const project = createEmptyVideoProject('Scopes');
  const trackId = project.tracks[0]!.id;
  const a = createTextClip(trackId, project.width, project.height, 0);
  a.duration = 10;
  const b = createTextClip(trackId, project.width, project.height, 10);
  b.duration = 10;
  project.clips = [a, b];
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, trackId, a, b };
}
it.each(['clip', 'track', 'video-group'] as const)(
  'retains %s FX resize/move, bypass and duplicates through history and reload',
  async (scope) => {
    const { store, trackId, a } = fixture();
    const bundle = await catalog('target-effect');
    const target =
      scope === 'clip'
        ? { kind: scope, clipId: a.id }
        : scope === 'track'
          ? { kind: scope, trackId }
          : { kind: scope };
    const id = await store.getState().applyEffectDocument({
      catalog: bundle,
      documentId: bundle.documents[0]!.id,
      startTime: 0,
      target,
    });
    if (!id) throw new Error('Expected applied FX');
    store.getState().updateEffectInstance(id, { startTime: 2, duration: 3, rangeMode: 'interval' });
    store.getState().updateEffectInstance(id, { startTime: 4 });
    const state = store.getState();
    const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
    if (undone?.status !== 'applied') throw new Error('Expected undo');
    expect(undone.project.effectInstances![0]).toMatchObject({ startTime: 2, duration: 3 });
    const redone = redoVideoEditorProjectHistory(undone.history, undone.project);
    if (redone?.status !== 'applied') throw new Error('Expected redo');
    const saved = parseHydratableVideoProject(JSON.parse(JSON.stringify(redone.project)));
    if (!saved) throw new Error('Expected valid saved FX');
    store.getState().setProject(saved);
    expect(saved.effectInstances![0]).toMatchObject({
      target,
      startTime: 4,
      duration: 3,
      rangeMode: 'interval',
    });
    store.getState().setEffectTargetBypassed(target, true);
    const copy = store.getState().duplicateEffectInstance(id);
    expect(copy).not.toBeNull();
    expect(
      store.getState().project!.effectInstances!.find((item) => item.id === copy)
    ).toMatchObject({ target, startTime: 4, duration: 3, enabled: true });
    expect(
      parseHydratableVideoProject(JSON.parse(JSON.stringify(store.getState().project)))
    ).not.toBeNull();
  }
);
it('creates a touching junction and graph in one undoable operation and replaces it atomically', async () => {
  const { store, a, b } = fixture();
  const bundle = await catalog('transition');
  const args = {
    catalog: bundle,
    documentId: bundle.documents[0]!.id,
    startTime: 0,
    target: { kind: 'junction' as const, leadingClipId: a.id, trailingClipId: b.id },
  };
  const first = await store.getState().applyEffectDocument(args);
  expect(first).not.toBeNull();
  const state = store.getState();
  expect(state.project!.transitions).toHaveLength(1);
  const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undone?.status !== 'applied') throw new Error('Expected undo');
  expect(undone.project.effectInstances ?? []).toHaveLength(0);
  expect(undone.project.clips.find((clip) => clip.id === b.id)!.startTime).toBe(10);
  const transitionId = state.project!.transitions![0]!.id;
  const second = await store
    .getState()
    .applyEffectDocument({ ...args, target: { kind: 'transition', transitionId } });
  expect(second).not.toBe(first);
  expect(store.getState().project!.effectInstances).toHaveLength(1);
  const replaced = store.getState();
  const restore = undoVideoEditorProjectHistory(replaced.projectHistory, replaced.project!);
  if (restore?.status !== 'applied') throw new Error('Expected undo replacement');
  expect(restore.project.effectInstances![0]!.id).toBe(first);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(replaced.project)))).not.toBeNull();
});

it.each(['clip', 'track', 'video-group'] as const)(
  'preserves editor region controls across %s history, duplicate and reload',
  async (kind) => {
    const { store, trackId, a } = fixture();
    const imported = await importRawEffectDocument(
      new Uint8Array(
        readFileSync(
          'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-spotlight.sniptale-effect.json'
        )
      )
    );
    if (!imported.ok) throw new Error('Invalid SDK region fixture');
    const bundle = await createEffectCatalogEntry(
      { document: imported.artifact, kind: 'raw-json' },
      1
    );
    const target =
      kind === 'clip' ? { kind, clipId: a.id } : kind === 'track' ? { kind, trackId } : { kind };
    const id = await store.getState().applyEffectDocument({
      catalog: bundle,
      documentId: bundle.documents[0]!.id,
      startTime: 0,
      target,
    });
    if (!id) throw new Error('Region not applied');
    const before = structuredClone(
      store.getState().project!.effectInstances!.find((item) => item.id === id)!.controls
    );
    const controls = { x: 12.25, y: 60.5, width: 35.5, height: 27.25 };
    store.getState().updateEffectInstance(id, { controls });
    const state = store.getState();
    const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
    if (undone?.status !== 'applied') throw new Error('No region undo');
    expect(undone.project.effectInstances!.find((item) => item.id === id)!.controls).toEqual(
      before
    );
    const redone = redoVideoEditorProjectHistory(undone.history, undone.project);
    if (redone?.status !== 'applied') throw new Error('No region redo');
    const saved = parseHydratableVideoProject(JSON.parse(JSON.stringify(redone.project)));
    if (!saved) throw new Error('Region not saved');
    expect(saved.effectInstances!.find((item) => item.id === id)!.controls).toMatchObject(controls);
    expect(JSON.parse(saved.effectSnapshots![0]!.source)).toMatchObject({
      editorRegion: {
        kind: 'rect',
        xControl: 'x',
      },
    });
    store.getState().setProject(saved);
    const copy = store.getState().duplicateEffectInstance(id);
    expect(
      store.getState().project!.effectInstances!.find((item) => item.id === copy)!.controls
    ).toMatchObject(controls);
    expect(saved.clips).toEqual(state.project!.clips);
    if (kind === 'clip') {
      store.getState().splitClipAt(a.id, 5);
      const split = store.getState().project!;
      expect(split.clips.length).toBeGreaterThan(saved.clips.length);
      for (const instance of split.effectInstances ?? [])
        expect(instance.controls).toMatchObject(controls);
      expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(split)))).not.toBeNull();
    }
  }
);
