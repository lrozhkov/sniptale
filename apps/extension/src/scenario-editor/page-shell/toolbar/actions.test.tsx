// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  commitProjectAggregatePresentation: vi.fn(),
  connectAggregateEditorPresence: vi.fn(() => ({ dispose: vi.fn() })),
  getMediaThumbnail: vi.fn(),
  getScenarioProjectEntry: vi.fn(),
  promoteStoredItem: vi.fn(),
  refreshScenarioAggregatePresentation: vi.fn(),
}));

vi.mock('../../../workflows/aggregate-editor-presence/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/aggregate-editor-presence/client')>()),
  connectAggregateEditorPresence: storageMocks.connectAggregateEditorPresence,
}));
vi.mock('../../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/aggregate-presentations')
  >()),
  commitProjectAggregatePresentation: storageMocks.commitProjectAggregatePresentation,
}));
vi.mock('../../../composition/persistence/media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/media-library')>()),
  getMediaThumbnail: storageMocks.getMediaThumbnail,
}));

vi.mock('../../../composition/persistence/scenario/projects/project', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/projects/project')
  >()),
  getScenarioProjectEntry: storageMocks.getScenarioProjectEntry,
}));
vi.mock('../../../composition/persistence/library-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/library-lifecycle')>()),
  promoteStoredItem: storageMocks.promoteStoredItem,
}));
vi.mock('../../project/presentation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/presentation')>()),
  refreshScenarioAggregatePresentation: storageMocks.refreshScenarioAggregatePresentation,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ScenarioToolbarActions } from './actions';
import { createScenarioEditorToolbarController } from './test-support';
import type { ScenarioEditorToolbarController } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderActions(controller: ScenarioEditorToolbarController) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(<ScenarioToolbarActions controller={controller} />));
}

function button(label: string) {
  const result = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!result) throw new Error(`Missing action: ${label}`);
  return result;
}

function clickByText(text: string) {
  const result = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(text)
  );
  if (!result) throw new Error(`Missing text action: ${text}`);
  act(() => result.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.getScenarioProjectEntry.mockResolvedValue({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    project: { updatedAt: 20 },
    workspaceRevision: 1,
  });
  storageMocks.getMediaThumbnail.mockResolvedValue({ blob: new Blob(['cover']) });
  storageMocks.commitProjectAggregatePresentation.mockResolvedValue(undefined);
  storageMocks.promoteStoredItem.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens panel modes, expands their lane, and toggles an active mode off', () => {
  const collapsed = createScenarioEditorToolbarController({
    ui: {
      leftPanelMode: 'navigator',
      navigatorCollapsed: true,
      setExportDialogOpen: vi.fn(),
      setLeftPanelMode: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });
  renderActions(collapsed);
  act(() => button('scenario.editor.projectsTool').click());
  expect(collapsed.ui.setNavigatorCollapsed).toHaveBeenCalledWith(false);
  expect(collapsed.ui.setLeftPanelMode).toHaveBeenCalledWith('projects');

  const active = createScenarioEditorToolbarController({
    ui: { ...collapsed.ui, leftPanelMode: 'projects', navigatorCollapsed: false },
  });
  renderActions(active);
  act(() => button('scenario.editor.projectsTool').click());
  expect(active.ui.setLeftPanelMode).toHaveBeenCalledWith('navigator');
});

it('routes enabled history, video-editor, and export callbacks', () => {
  const controller = createScenarioEditorToolbarController({
    projectHistory: {
      canRedoProject: true,
      canUndoProject: true,
      redoProjectChange: vi.fn(),
      trackProjectMutation: vi.fn(),
      undoProjectChange: vi.fn(),
    },
  });
  renderActions(controller);

  act(() => {
    button('scenario.editor.undo').click();
    button('scenario.editor.redo').click();
  });
  clickByText('scenario.editor.videoAction');
  clickByText('scenario.editor.exportAction');

  expect(controller.projectHistory.undoProjectChange).toHaveBeenCalledOnce();
  expect(controller.projectHistory.redoProjectChange).toHaveBeenCalledOnce();
  expect(controller.projectCrud.openVideoEditor).toHaveBeenCalledOnce();
  expect(controller.ui.setExportDialogOpen).toHaveBeenCalledWith(true);
});

it('renders saved, saving, and titled error status families', () => {
  const saved = createScenarioEditorToolbarController();
  renderActions(saved);
  expect(container?.textContent).toContain('common.states.saved');

  const saving = createScenarioEditorToolbarController({
    project: { ...saved.project, saveState: 'saving' },
  });
  renderActions(saving);
  expect(container?.textContent).toContain('common.states.saving');

  const failed = createScenarioEditorToolbarController({
    project: { ...saved.project, error: 'Save failed', saveState: 'error' },
  });
  renderActions(failed);
  expect(container?.textContent).toContain('common.states.error');
  expect(container?.querySelector('[title="Save failed"]')).not.toBeNull();
});

it('shows draft storage independently and promotes the project in place', async () => {
  const controller = createScenarioEditorToolbarController();
  renderActions(controller);
  await act(async () => Promise.resolve());

  const promote = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes('gallery.preview.saveToLibrary')
  );
  expect(promote).toBeDefined();
  await act(async () => promote?.click());

  expect(storageMocks.promoteStoredItem).toHaveBeenCalledWith({
    id: controller.project.project?.id,
    kind: 'scenario-project',
  });
  expect(container?.textContent).toContain('editor.documentActions.inLibrary');
});
