import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createEffectCatalogEntry } from '../../../composition/persistence/effect-bundles/catalog-builder';
import { importRawEffectDocument } from '../../../features/video/project/effect-bundle/import/zip';
import { applyEffectCatalogDocument } from '../../../features/video/project/effect-instance/apply';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

const locale = vi.hoisted(() => ({ value: 'ru' }));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  getCurrentLocale: () => locale.value,
}));

it('localizes only new instances; edits, empty strings, history and restored copies retain text', async () => {
  locale.value = 'ru';
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json'
  );
  const imported = await importRawEffectDocument(new Uint8Array(source));
  if (!imported.ok) throw new Error('Expected valid collection document');
  const catalog = await createEffectCatalogEntry(
    { document: imported.artifact, kind: 'raw-json' },
    1
  );
  const args = {
    catalog,
    documentId: catalog.documents[0]!.id,
    instanceId: 'ru-instance',
    project: createEmptyVideoProject('Localized text'),
    startTime: 0,
    target: { kind: 'scene' } as const,
  };
  const pending = applyEffectCatalogDocument(args);
  locale.value = 'en';
  const applied = await pending;
  const controls = applied.effectInstances![0]!.controls;
  const definitions = JSON.parse(source.toString()).controls;
  const title = definitions.find((control: { id: string }) => control.id === 'title');
  expect(controls['title']).toBe(title.localizedDefaultValue.ru);
  const english = await applyEffectCatalogDocument({ ...args, instanceId: 'en-instance' });
  expect(english.effectInstances![0]!.controls['title']).toBe(title.localizedDefaultValue.en);

  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(applied);
  store
    .getState()
    .updateEffectInstance('ru-instance', { controls: { title: '', subtitle: 'My text' } });
  const state = store.getState();
  const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undone?.status !== 'applied') throw new Error('Expected undo');
  expect(undone.project.effectInstances![0]!.controls['title']).toBe(
    title.localizedDefaultValue.ru
  );
  const redone = redoVideoEditorProjectHistory(undone.history, undone.project);
  if (redone?.status !== 'applied') throw new Error('Expected redo');
  const restored = parseHydratableVideoProject(structuredClone(redone.project));
  if (!restored) throw new Error('Expected valid saved project');
  store.getState().setProject(restored);
  const copyId = store.getState().duplicateEffectInstance('ru-instance');
  expect(copyId).not.toBeNull();
  for (const instance of store.getState().project!.effectInstances!) {
    expect(instance.controls).toMatchObject({ title: '', subtitle: 'My text' });
  }
  expect(store.getState().project!.effectSnapshots![0]!.source).toBe(source.toString());
});
