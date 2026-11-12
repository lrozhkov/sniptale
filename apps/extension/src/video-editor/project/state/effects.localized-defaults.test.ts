import { expect, it, vi } from 'vitest';
import { readValidAnimationCatalog } from '../../../composition/persistence/effect-bundles/fixture.test-support';
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
  const catalog = await readValidAnimationCatalog();
  const source = catalog.documents[0]!.source!;
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
  store.getState().updateEffectInstance('ru-instance', { controls: { title: '' } });
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
    expect(instance.controls).toMatchObject({ title: '' });
  }
  expect(store.getState().project!.effectSnapshots![0]!.source).toBe(source.toString());
});
