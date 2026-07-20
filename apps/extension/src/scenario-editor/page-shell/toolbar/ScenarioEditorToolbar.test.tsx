// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenarioEditorToolbar } from './ScenarioEditorToolbar';
import { createScenarioEditorToolbarController } from './test-support';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/annotatable-image-surface', () => ({
  AnnotatableImageToolbar: (props: { children: React.ReactNode; className?: string }) => (
    <div data-testid="annotatable-toolbar" className={props.className}>
      {props.children}
    </div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderToolbar(
  overrides: Partial<Parameters<typeof ScenarioEditorToolbar>[0]['controller']> = {}
) {
  const controller = createScenarioEditorToolbarController(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioEditorToolbar controller={controller as never} />);
  });

  return controller;
}

function clickButton(label: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
}

function changeInput(label: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Missing input ${label}`);
  }

  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  return input;
}

function keyDownInput(label: string, key: string) {
  const input = container?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Missing input ${label}`);
  }

  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

  return input;
}

function blurInput(label: string) {
  const input = container?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Missing input ${label}`);
  }

  act(() => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });

  return input;
}

function clickButtonByText(label: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(label)
  );

  act(() => {
    button?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('wires global undo and redo toolbar actions', () => {
  const controller = renderToolbar({
    projectHistory: {
      canRedoProject: true,
      canUndoProject: true,
      redoProjectChange: vi.fn(),
      trackProjectMutation: vi.fn(),
      undoProjectChange: vi.fn(),
    },
  });

  clickButton('scenario.editor.undo');
  clickButton('scenario.editor.redo');

  expect(controller.projectHistory.undoProjectChange).toHaveBeenCalledTimes(1);
  expect(controller.projectHistory.redoProjectChange).toHaveBeenCalledTimes(1);
});

it('keeps the shared toolbar shell fixed-height and scroll-free', () => {
  renderToolbar();

  const shell = container?.querySelector('[data-testid="annotatable-toolbar"]');
  expect(shell?.className).toContain('h-14');
  expect(shell?.className).not.toContain('overflow-x-auto');
});

it('disables undo and redo buttons when project history is unavailable', () => {
  renderToolbar({
    projectHistory: {
      canRedoProject: false,
      canUndoProject: false,
      redoProjectChange: vi.fn(),
      trackProjectMutation: vi.fn(),
      undoProjectChange: vi.fn(),
    },
  });

  const undoButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="scenario.editor.undo"]'
  );
  const redoButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="scenario.editor.redo"]'
  );

  expect(undoButton?.disabled).toBe(true);
  expect(redoButton?.disabled).toBe(true);
});

it('toggles navigator, panel modes, and export action wiring', () => {
  const controller = renderToolbar();

  clickButton('scenario.editor.collapseNavigator');
  clickButton('scenario.editor.projectsTool');
  clickButton('scenario.editor.aiEditorTool');
  clickButtonByText('scenario.editor.videoAction');
  clickButtonByText('scenario.editor.exportAction');

  expect(controller.ui.setNavigatorCollapsed).toHaveBeenCalledWith(true);
  expect(controller.ui.setLeftPanelMode).toHaveBeenNthCalledWith(1, 'projects');
  expect(controller.ui.setLeftPanelMode).toHaveBeenNthCalledWith(2, 'ai-editor');
  expect(controller.projectCrud.openVideoEditor).toHaveBeenCalledTimes(1);
  expect(controller.ui.setExportDialogOpen).toHaveBeenCalledWith(true);
});

it('surfaces scenario save failures in the primary toolbar status badge', () => {
  renderToolbar({
    project: {
      error: 'Failed to save scenario',
      project: createScenarioEditorToolbarController().project.project,
      quickEditStep: null,
      saveState: 'error',
    },
  });

  expect(container?.textContent).toContain('common.states.error');
  expect(container?.querySelector('[title="Failed to save scenario"]')).not.toBeNull();
});

it('renders the saving badge state while a project export is still in flight', () => {
  renderToolbar({
    project: {
      error: null,
      project: createScenarioEditorToolbarController().project.project,
      quickEditStep: null,
      saveState: 'saving',
    },
  });

  expect(container?.textContent).toContain('common.states.saving');
});

it('returns to navigator when an active panel tool is clicked again', () => {
  const controller = renderToolbar({
    ui: {
      leftPanelMode: 'projects',
      navigatorCollapsed: true,
      setExportDialogOpen: vi.fn(),
      setLeftPanelMode: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });

  clickButton('scenario.editor.expandNavigator Project 1');
  clickButton('scenario.editor.projectsTool');

  expect(controller.ui.setNavigatorCollapsed).toHaveBeenCalledWith(false);
  expect(controller.ui.setLeftPanelMode).toHaveBeenCalledWith('navigator');
});

it('expands the navigator when a secondary panel tool is opened from the collapsed state', () => {
  const controller = renderToolbar({
    ui: {
      leftPanelMode: 'navigator',
      navigatorCollapsed: true,
      setExportDialogOpen: vi.fn(),
      setLeftPanelMode: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });

  clickButton('scenario.editor.projectsTool');

  expect(controller.ui.setNavigatorCollapsed).toHaveBeenCalledWith(false);
  expect(controller.ui.setLeftPanelMode).toHaveBeenCalledWith('projects');
});

it('renames the project on blur and handles enter/escape shortcuts', () => {
  const controller = renderToolbar();
  const renameLabel = 'scenario.editor.renameProject';
  const input = changeInput(renameLabel, 'Renamed project');

  blurInput(renameLabel);

  expect(controller.projectCrud.renameProject).toHaveBeenCalledWith('Renamed project');

  const blurSpy = vi.spyOn(input, 'blur');
  changeInput(renameLabel, 'Draft project');
  keyDownInput(renameLabel, 'Escape');

  expect(input.value).toBe('Project 1');
  expect(blurSpy).toHaveBeenCalledTimes(1);

  changeInput(renameLabel, 'Confirm by enter');
  keyDownInput(renameLabel, 'Enter');

  expect(blurSpy).toHaveBeenCalledTimes(2);
});

it('falls back to error and title text when the project is unavailable', () => {
  renderToolbar({
    project: {
      error: 'Project failed to load',
      project: null,
      quickEditStep: null,
      saveState: 'saved',
    },
  });

  expect(
    container?.querySelector<HTMLInputElement>('[aria-label="scenario.editor.renameProject"]')
      ?.value
  ).toBe('Project failed to load');

  renderToolbar({
    project: {
      error: null,
      project: null,
      quickEditStep: null,
      saveState: 'saved',
    },
  });

  expect(
    container?.querySelector<HTMLInputElement>('[aria-label="scenario.editor.renameProject"]')
      ?.value
  ).toBe('scenario.editor.title');
});
