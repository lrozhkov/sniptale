// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
