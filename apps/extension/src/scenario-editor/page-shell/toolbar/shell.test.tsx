// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { SCENARIO_INSPECTOR_WIDTH_CLASS_NAME } from '../../inspector/layout';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from '../presentation/mode';
import { ScenarioV3ShellToolbar } from './shell';
import type { useScenarioV3EditorState } from '../state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;
type TestCanvasControls = NonNullable<
  ComponentProps<typeof ScenarioV3ShellToolbar>['canvasControls']
>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createToolbarEditor(): ScenarioV3EditorState {
  return {
    canRedo: true,
    canUndo: true,
    elementActions: { insertElement: vi.fn(), insertImageFile: vi.fn() },
    history: { redo: vi.fn(), undo: vi.fn() },
    project: createScenarioProjectV3('Deck toolbar'),
  } as unknown as ScenarioV3EditorState;
}

function createCanvasControls(): TestCanvasControls {
  return {
    gridVisible: true,
    magnetEnabled: false,
    navigatorVisible: false,
    onFit: vi.fn(),
    onSetNavigatorVisible: vi.fn(),
    onSetGridVisible: vi.fn(),
    onSetMagnetEnabled: vi.fn(),
    onSetSnapToGrid: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomOne: vi.fn(),
    scale: 0.75,
    snapToGrid: false,
    zoomMode: 'fit',
  };
}

function renderToolbar(
  args: {
    canvasControls?: TestCanvasControls | null;
    editor?: ScenarioV3EditorState;
    mode?: ScenarioEditorMode;
  } = {}
) {
  const canvasControls =
    args.canvasControls === undefined ? createCanvasControls() : args.canvasControls;
  const editor = args.editor ?? createToolbarEditor();
  const onModeChange = vi.fn();
  const onToggleAi = vi.fn();
  const onOpenExport = vi.fn();
  const onOpenGridTool = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioV3ShellToolbar
        canvasControls={canvasControls}
        editor={editor}
        mode={args.mode ?? SCENARIO_EDITOR_MODES.edit}
        onToggleAi={onToggleAi}
        onModeChange={onModeChange}
        onOpenExport={onOpenExport}
        onOpenGridTool={onOpenGridTool}
      />
    );
  });

  return {
    canvasControls,
    editor,
    onModeChange,
    onOpenExport,
    onOpenGridTool,
    onToggleAi,
  };
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

it('uses editor toolbar controls for deck modes and shell actions', () => {
  const { onModeChange, onOpenExport } = renderToolbar();

  clickToolbarButton(translate('scenario.editor.modePlay'));
  clickToolbarButton(translate('scenario.editor.modePresenter'));
  clickToolbarButton(translate('scenario.editor.modeOverview'));
  clickToolbarButton(translate('scenario.editor.export'));

  expect(onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.play);
  expect(onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.presenter);
  expect(onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.overview);
  expect(onOpenExport).toHaveBeenCalledTimes(1);
});

it('groups deck summary, modes, insert tools, export, AI, and history in order', () => {
  renderToolbar();

  expect(container?.querySelector('[data-ui="scenario.toolbar.groups"]')?.className).toContain(
    'overflow-x-auto'
  );
  const groups = getToolbarGroups();

  expect(
    container?.querySelector('[data-ui="scenario.toolbar.deck-summary"]')?.textContent
  ).toContain('Deck toolbar');
  expect(
    container?.querySelector('[data-ui="scenario.toolbar.deck-summary"]')?.className
  ).toContain(SCENARIO_INSPECTOR_WIDTH_CLASS_NAME);
  expect(groups.map((group) => group.getAttribute('data-ui'))).toEqual([
    'scenario.toolbar.mode-group',
    'scenario.toolbar.insert-menu',
    'scenario.canvas.zoom-controls',
    'scenario.toolbar.grid-tool-group',
    'scenario.toolbar.export-group',
    'scenario.toolbar.ai-group',
    'scenario.toolbar.history-group',
  ]);
  expectToolbarGroupLabels(groups);
});

function expectToolbarGroupLabels(groups: HTMLElement[]) {
  expect(getButtonLabels(groups[0])).toEqual([
    translate('scenario.editor.modeEdit'),
    translate('scenario.editor.modePlay'),
    translate('scenario.editor.modePresenter'),
    translate('scenario.editor.modeOverview'),
  ]);
  expect(getButtonLabels(groups[1])).toEqual([
    translate('scenario.editor.insertText'),
    translate('scenario.editor.insertShape'),
    translate('scenario.editor.insertLine'),
    translate('scenario.editor.insertArrow'),
    translate('scenario.editor.insertCallout'),
    translate('scenario.editor.insertCode'),
  ]);
  expect(getButtonLabels(groups[2])).toEqual([
    translate('scenario.editor.zoomOut'),
    `${translate('scenario.editor.zoomToActualSize')} · ${translate('scenario.editor.zoomCurrentPrefix')} 75%`,
    translate('scenario.editor.zoomIn'),
  ]);
  expect(getButtonLabels(groups[3])).toEqual([translate('scenario.editor.toggleGrid')]);
  expect(getButtonLabels(groups[4])).toEqual([translate('scenario.editor.export')]);
  expect(getButtonLabels(groups[5])).toEqual([translate('scenario.editor.aiEditorTool')]);
  expect(getButtonLabels(groups[6])).toEqual([
    translate('scenario.editor.undo'),
    translate('scenario.editor.redo'),
  ]);
}

it('marks the active mode and disabled history actions with shared icon button state', () => {
  const editor = createToolbarEditor();
  editor.canUndo = false;
  editor.canRedo = false;
  renderToolbar({ editor });

  const edit = getToolbarButton(translate('scenario.editor.modeEdit'));
  const play = getToolbarButton(translate('scenario.editor.modePlay'));
  const ai = getToolbarButton(translate('scenario.editor.aiEditorTool'));
  const undo = getToolbarButton(translate('scenario.editor.undo'));
  const redo = getToolbarButton(translate('scenario.editor.redo'));

  expect(edit?.getAttribute('data-active')).toBe('true');
  expect(play?.getAttribute('data-active')).toBe('false');
  expect(ai?.disabled).toBe(false);
  expect(undo?.disabled).toBe(true);
  expect(redo?.disabled).toBe(true);
});

it('routes insert, undo, and redo through the editor state controller', () => {
  const { editor } = renderToolbar();

  clickToolbarButton(translate('scenario.editor.insertText'));
  clickToolbarButton(translate('scenario.editor.undo'));
  clickToolbarButton(translate('scenario.editor.redo'));

  expect(editor.elementActions.insertElement).toHaveBeenCalledWith('text');
  expect(editor.history.undo).toHaveBeenCalledTimes(1);
  expect(editor.history.redo).toHaveBeenCalledTimes(1);
});

it('routes canvas zoom and grid tool selection through the toolbar', () => {
  const { canvasControls, onOpenGridTool } = renderToolbar();

  clickToolbarButton(translate('scenario.editor.zoomOut'));
  clickToolbarButton(
    `${translate('scenario.editor.zoomToActualSize')} · ${translate('scenario.editor.zoomCurrentPrefix')} 75%`
  );
  clickToolbarButton(translate('scenario.editor.zoomIn'));
  clickToolbarButton(translate('scenario.editor.toggleGrid'));

  expect(canvasControls?.onZoomOut).toHaveBeenCalledTimes(1);
  expect(canvasControls?.onZoomOne).toHaveBeenCalledTimes(1);
  expect(canvasControls?.onZoomIn).toHaveBeenCalledTimes(1);
  expect(onOpenGridTool).toHaveBeenCalledTimes(1);
});

it('hides insert and canvas controls outside edit mode', () => {
  renderToolbar({ mode: SCENARIO_EDITOR_MODES.play });

  expect(getToolbarButton(translate('scenario.editor.insertText'))).toBeNull();
  expect(getToolbarButton(translate('scenario.editor.zoomOut'))).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.toolbar.insert-menu"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.canvas.zoom-controls"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.toolbar.grid-tool-group"]')).toBeNull();
  expect(getToolbarButton(translate('scenario.editor.layouts'))).toBeNull();
  expect(getToolbarButton(translate('scenario.editor.export'))).not.toBeNull();
});

it('opens the active v3 AI panel from the toolbar entry point', () => {
  const { onToggleAi } = renderToolbar();

  clickToolbarButton(translate('scenario.editor.aiEditorTool'));

  expect(onToggleAi).toHaveBeenCalledTimes(1);
});

function clickToolbarButton(label: string) {
  const button = getToolbarButton(label);
  expect(button).not.toBeNull();
  act(() => {
    button?.click();
  });
}

function getToolbarButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) ?? null;
}

function getToolbarGroups() {
  return Array.from(
    container?.querySelectorAll<HTMLElement>(
      [
        '[data-ui="scenario.toolbar.mode-group"]',
        '[data-ui="scenario.toolbar.insert-menu"]',
        '[data-ui="scenario.canvas.zoom-controls"]',
        '[data-ui="scenario.toolbar.grid-tool-group"]',
        '[data-ui="scenario.toolbar.export-group"]',
        '[data-ui="scenario.toolbar.ai-group"]',
        '[data-ui="scenario.toolbar.history-group"]',
      ].join(', ')
    ) ?? []
  );
}

function getButtonLabels(group: Element | undefined) {
  return Array.from(group?.querySelectorAll<HTMLButtonElement>('button') ?? []).map((button) =>
    button.getAttribute('aria-label')
  );
}
