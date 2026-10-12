// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../features/scenario/project/factories';

const io = vi.hoisted(() => ({
  load: vi.fn(),
  previous: vi.fn(),
  asset: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  importImages: vi.fn(),
  select: vi.fn(),
  mount: vi.fn(),
  list: vi.fn(),
}));
vi.mock('./library-browser', () => ({
  GuideLibraryBrowser: ({
    onChoose,
  }: Pick<ComponentProps<typeof GuideLibraryBrowser>, 'onChoose'>) => (
    <button onClick={() => onChoose('library-image', 'one.png', 'image')}>Library image</button>
  ),
}));
vi.mock('./runtime/resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: async (id: string) => {
    const project = await io.load(id);
    return project
      ? {
          currentRevision: 1,
          versions: [
            { project, revision: 1, savedAt: project.updatedAt },
            ...(io.previous() ?? []),
          ],
        }
      : null;
  },
}));
vi.mock('../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: io.asset,
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.asset,
  createScenarioProjectRecord: io.create,
  duplicateScenarioProjectRecord: io.duplicate,
  deleteScenarioProjectRecord: io.remove,
  saveScenarioProjectRecord: io.save,
  importScenarioImages: io.importImages,
  listScenarioProjectSummaries: io.list,
  getScenarioProjectRecord: io.load,
}));
vi.mock('../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: io.select }));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));
vi.mock('../../ui/page-bootstrap', () => ({ renderPageShell: io.mount }));
import { GUIDE_AUTOSAVE_IDLE_MS } from './runtime/autosave';
import { ScenarioEditorPage } from './ScenarioEditorPage';
import type { GuideLibraryBrowser } from './library-browser';
import { clickGuideControl } from './test-support/guide-controls';

let root: Root;
let container: HTMLDivElement;
function committedSnapshot(
  project: ReturnType<typeof createGuideProject>,
  workspaceRevision: number
) {
  return { project, workspaceRevision };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  io.previous.mockReturnValue([]);
  io.list.mockResolvedValue([]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const project = createGuideProject('Local guide', 'guide', 100);
  project.items.push(createGuideStep('First step', 'first'));
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(undefined);
  io.save.mockImplementation(async (value, { expectedRevision: revision }) =>
    committedSnapshot({ ...value, updatedAt: 101 }, revision + 1)
  );
  io.duplicate.mockImplementation(async (value, name) =>
    committedSnapshot({ ...value, id: 'copy', name, updatedAt: 102 }, 37)
  );
  io.remove.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ScenarioEditorPage />));
}
async function click(label: string, scope: ParentNode = container) {
  await clickGuideControl(label, scope);
}

async function settleAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS);
  });
}

async function editField(selector: string, value: string) {
  const field = container.querySelector(selector);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement))
    throw new Error('Missing field');
  await act(async () => {
    field.focus();
    const prototype =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('saves the edited project title and added steps against the loaded revision', async () => {
  await render();
  expect(container.querySelectorAll('article')).toHaveLength(1);
  await editField('input[aria-label="Scenario"]', 'Renamed guide');
  await click('Add step');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await settleAutosave();
  expect(io.save).toHaveBeenCalledWith(
    expect.objectContaining({
      version: 4,
      name: 'Renamed guide',
      items: expect.arrayContaining([expect.objectContaining({ id: 'first' })]),
    }),
    { expectedRevision: 1, historyActionId: expect.any(String) }
  );
  expect(io.save).toHaveBeenCalledTimes(2);
  expect(io.save.mock.calls[1]![0].items).toHaveLength(2);
  expect(io.save.mock.calls[1]![1]).toEqual({
    expectedRevision: 2,
    historyActionId: expect.any(String),
  });
  expect(io.save.mock.calls[1]![1].historyActionId).not.toBe(
    io.save.mock.calls[0]![1].historyActionId
  );
  expect(container.querySelector('[aria-label="Autosave: Saved"]')).not.toBeNull();
  expect(container.querySelector('.guide-page-feedback')).toBeNull();
});

it('keeps recoverable edits after save failure and allows retry', async () => {
  io.save.mockRejectedValueOnce(new Error('quota'));
  await render();
  await click('Add step');
  await settleAutosave();
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Your edits remain in the editor');
  await click('Retry');
  expect(io.save).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[aria-label="Autosave: Saved"]')).not.toBeNull();
  expect(container.querySelector('.guide-page-feedback')).toBeNull();
});

it('preserves edits and stops repeated saves after a concurrent project change', async () => {
  const error = new Error('Changed elsewhere');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.save.mockRejectedValueOnce(error);
  await render();
  await click('Add step');
  await settleAutosave();
  expect(container.textContent).toContain('This project changed in another tab');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await settleAutosave();
  expect(io.save).toHaveBeenCalledTimes(1);
});

it('recovers a conflicted edit buffer by copying it and retains it if copying fails', async () => {
  const error = new Error('Changed elsewhere');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.save.mockRejectedValueOnce(error);
  await render();
  await click('Add step');
  await settleAutosave();
  io.duplicate.mockRejectedValueOnce(new Error('quota'));
  await click('Duplicate project');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Could not create a copy');
  expect(container.textContent).toContain('This project changed in another tab');
  await settleAutosave();
  expect(io.save).toHaveBeenCalledTimes(1);
  await click('Duplicate project');
  expect(io.duplicate).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'guide', items: expect.any(Array) }),
    'Local guide — copy'
  );
  expect(io.select).toHaveBeenLastCalledWith({ projectId: 'copy' });
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).not.toContain('Could not create a copy');
  await click('Add step');
  await settleAutosave();
  expect(io.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'copy' }), {
    expectedRevision: 37,
    historyActionId: expect.any(String),
  });
});

it('preserves Undo during autosave and adopts the acknowledged revision', async () => {
  let complete: (() => void) | undefined;
  io.save.mockImplementation(
    (project) =>
      new Promise((resolve) => {
        complete = () => resolve(committedSnapshot({ ...project, updatedAt: 101 }, 2));
      })
  );
  await render();
  await click('Add step');
  await settleAutosave();
  const main = container.querySelector('main');
  if (!main) throw new Error('Missing page');
  await act(async () =>
    main.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(container.querySelectorAll('article')).toHaveLength(1);
  const pendingUndoClose = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(pendingUndoClose);
  expect(pendingUndoClose.defaultPrevented).toBe(true);
  await act(async () => complete?.());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  io.save.mockImplementation(async (project) =>
    committedSnapshot({ ...project, updatedAt: 102 }, 2)
  );
  await settleAutosave();
  expect(io.save).toHaveBeenLastCalledWith(expect.objectContaining({ items: expect.any(Array) }), {
    expectedRevision: 2,
    historyActionId: expect.any(String),
  });
});

it('keeps image import undoable and saves Undo against its new revision', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  io.importImages.mockImplementation(async ({ project }) =>
    committedSnapshot(
      {
        ...project,
        updatedAt: 105,
        items: [...project.items, createGuideStep('Imported', 'imported')],
      },
      37
    )
  );
  await render();
  await editField('article#first .guide-step-title', 'Unsaved title');
  await click('Resources');
  await click('Image library');
  await click('Library image', document.body);
  await click('Import selected', document.body);
  await click('Close', document.body);
  expect(io.importImages.mock.calls[0]?.[0]).toMatchObject({
    baseUpdatedAt: 100,
    project: { items: [{ title: 'Unsaved title' }] },
    expectedRevision: 1,
  });
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Undo');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article .guide-step-title')).toHaveProperty(
    'value',
    'Unsaved title'
  );
  await settleAutosave();
  expect(io.save).toHaveBeenLastCalledWith(expect.anything(), {
    expectedRevision: 37,
    historyActionId: expect.any(String),
  });
});

it('skips autosave when Undo then Redo restores the durable snapshot', async () => {
  await render();
  await click('Add step');
  await settleAutosave();
  expect(io.save).toHaveBeenCalledTimes(1);
  await click('Undo');
  await click('Redo');
  const unchangedClose = new Event('beforeunload', { cancelable: true });
  await act(async () => window.dispatchEvent(unchangedClose));
  expect(unchangedClose.defaultPrevented).toBe(false);
  await settleAutosave();
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.guide-page-feedback')).toBeNull();
});

it('opens stored revisions in ordinary undo and autosaves against the current revision', async () => {
  const previous = createGuideProject('Previous guide', 'guide', 90);
  io.previous.mockReturnValue([{ project: previous, revision: 0, savedAt: 90 }]);
  await render();
  await click('Undo');
  expect(container.querySelector('input')?.value).toBe('Previous guide');
  await settleAutosave();
  expect(io.save).toHaveBeenCalledWith(previous, {
    expectedRevision: 1,
    historyActionId: expect.any(String),
  });
  await click('Redo');
  expect(container.querySelector('input')?.value).toBe('Local guide');
});
