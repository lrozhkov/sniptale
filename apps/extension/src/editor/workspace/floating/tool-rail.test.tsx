// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorTool } from '../../../features/editor/document/types';
import {
  getFrameAnnotationCreationDefaults,
  setFrameAnnotationCreationDefaults,
} from '../../frame-annotation/creation-defaults';
import { translate } from '../../../platform/i18n';
import type { EditorToolbarContentProps } from '../toolbar/types';
import { EditorFloatingToolRail } from './tool-rail';

const controller = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  redo: vi.fn(async () => undefined),
  resetToOriginal: vi.fn(async () => undefined),
  undo: vi.fn(async () => undefined),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => controller,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const originalAnnotationDefaults = getFrameAnnotationCreationDefaults();

function createProps(
  overrides: Partial<EditorToolbarContentProps> = {}
): EditorToolbarContentProps {
  return {
    activeTool: 'select',
    gridEnabled: false,
    hasImage: true,
    history: { canRedo: false, canUndo: false, index: 0, size: 1 },
    inspector: 'tool',
    inspectorCollapsed: false,
    inspectorMeta: {
      subtitle: 'Tool settings',
      title: 'Tool',
    },
    isToolButtonActive: (tool) => tool === 'select',
    isToolMode: true,
    viewportPreviewOpen: false,
    zoomPercent: 100,
    onActivateTool: vi.fn(),
    onBeforeSelectionAwareAction: vi.fn(),
    onCollapseInspector: vi.fn(),
    onExpandInspector: vi.fn(),
    onSetViewportPreviewOpenManually: vi.fn(),
    onToggleInspector: vi.fn(),
    ...overrides,
  };
}

function renderToolRail(
  props: EditorToolbarContentProps & {
    leftDrawerOpen?: boolean;
    onToggleActiveToolOptions?: (tool: EditorTool) => void;
  }
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditorFloatingToolRail {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  setFrameAnnotationCreationDefaults(originalAnnotationDefaults);
  vi.unstubAllGlobals();
});

it('renders the exact centered tool order with two vertical dividers', () => {
  const props = createProps();
  renderToolRail(props);

  const actionIds = [
    ...(queryUi('editor.floating.tool-rail')?.querySelectorAll('button') ?? []),
  ].map((element) => element.getAttribute('data-ui'));

  expect(actionIds).toEqual([
    'editor.floating.tool-rail.select',
    'content.toolbar.future-frame-style',
    'content.toolbar.future-frame-style.menu',
    'editor.floating.tool-rail.pencil',
    'editor.floating.tool-rail.marker',
    'editor.floating.tool-rail.text',
    'editor.floating.tool-rail.shape',
    'editor.floating.tool-rail.arrow',
    'editor.floating.tool-rail.blur',
  ]);
  expect(queryUi('editor.floating.tool-rail.crop')).toBeNull();
  expect(queryUi('editor.floating.tool-rail.frame')).toBeNull();
  expect(queryUi('editor.floating.tool-rail.browser-frame')).toBeNull();
  expect(queryUi('editor.floating.tool-rail.meta')).toBeNull();
  const dividers = [
    queryUi('editor.floating.tool-rail.divider.before-frame'),
    queryUi('editor.floating.tool-rail.divider.after-frame'),
  ];
  expect(dividers).toHaveLength(2);
  for (const divider of dividers) {
    expect(divider?.classList.contains('sniptale-glass-toolbar-divider')).toBe(true);
    expect(divider?.classList.contains('sniptale-divider')).toBe(true);
  }
  expect(queryUi('content.toolbar.future-frame-callout')).toBeNull();
  expect(queryUi('content.toolbar.future-frame-step-badge')).toBeNull();

  act(() => getToolButton('text').click());
  expect(props.onActivateTool).toHaveBeenCalledWith('text');
  expect(props.onToggleInspector).not.toHaveBeenCalled();
});

it('uses the content frame controls with the same enable and popover behavior', async () => {
  const props = createProps({
    activeTool: 'frame-annotation',
    isToolButtonActive: (tool) => tool === 'frame-annotation',
  });
  renderToolRail(props);

  const frame = getContentFrameButton('future-frame-style');
  const comments = getContentFrameButton('future-frame-callout');
  const numbering = getContentFrameButton('future-frame-step-badge');
  expect(frame.getAttribute('aria-pressed')).toBe('true');

  await act(async () => {
    comments.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    comments.click();
    await Promise.resolve();
  });
  expect(getFrameAnnotationCreationDefaults()).toMatchObject({
    callout: { enabled: true },
    stepBadge: null,
  });
  expect(comments.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[data-ui="content.toolbar.future-callout-popover"]')).toBeNull();

  await act(async () => {
    getContentFrameButton('future-frame-callout.menu').click();
    await Promise.resolve();
  });
  expect(
    document.querySelector('[data-ui="content.toolbar.future-callout-popover"]')
  ).not.toBeNull();

  await act(async () => {
    numbering.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    numbering.click();
    await Promise.resolve();
  });
  expect(getFrameAnnotationCreationDefaults()).toMatchObject({
    callout: { enabled: true },
    stepBadge: { enabled: true },
  });
  expect(numbering.getAttribute('aria-pressed')).toBe('true');
  expect(props.onActivateTool).not.toHaveBeenCalled();

  rerenderToolRail(createProps());
  expect(getContentFrameButton('future-frame-style').getAttribute('aria-pressed')).toBe('false');
  expect(queryUi('content.toolbar.future-frame-callout')).toBeNull();
  expect(queryUi('content.toolbar.future-frame-step-badge')).toBeNull();

  const restoredProps = createProps({
    activeTool: 'frame-annotation',
    isToolButtonActive: (tool) => tool === 'frame-annotation',
  });
  rerenderToolRail(restoredProps);
  expect(getContentFrameButton('future-frame-callout').getAttribute('aria-pressed')).toBe('true');
  expect(getContentFrameButton('future-frame-step-badge').getAttribute('aria-pressed')).toBe(
    'true'
  );
});

it('activates the frame group from its persistent frame button', () => {
  const props = createProps();
  renderToolRail(props);

  const frame = getContentFrameButton('future-frame-style');
  act(() => frame.click());

  expect(props.onActivateTool).toHaveBeenCalledWith('frame-annotation');
});

it('describes drawing modifiers and toggles options on a repeated active-tool click', () => {
  const onToggleActiveToolOptions = vi.fn();
  renderToolRail({
    ...createProps({
      activeTool: 'shape',
      isToolButtonActive: (tool) => tool === 'shape',
    }),
    onToggleActiveToolOptions,
  });

  const shapeLabel = `${translate('editor.tools.shape')}\n${translate(
    'content.toolbar.drawingShapeModifierHint'
  )}`;
  const shapeButton = getToolButton('shape');
  expect(shapeButton.getAttribute('aria-label')).toBe(shapeLabel);
  act(() => shapeButton.click());

  expect(onToggleActiveToolOptions).toHaveBeenCalledWith('shape');
});

it('uses a top-centered horizontal rail and a separate horizontal history panel', () => {
  renderToolRail(createProps());

  const stack = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.stack"]'
  );
  const rail = container?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-rail"]');

  expect(stack?.className).toContain('left-1/2');
  expect(stack?.className).toContain('top-3');
  expect(stack?.className).toContain('-translate-x-1/2');
  expect(rail?.className).toContain('flex-row');
  expect(rail?.getAttribute('aria-label')).toBe(translate('shared.ui.commandPaletteToolsSection'));
  const history = queryUi('editor.floating.tool-rail.history');
  expect(history?.className).toContain('flex-row');
  expect(history?.className).toContain('min-[721px]:absolute');
  expect(history?.className).toContain('min-[721px]:left-[calc(100%+0.75rem)]');
  expect(stack?.firstElementChild).toBe(rail);
  expect(history?.parentElement).toBe(stack);
});

it('wraps the mobile rail instead of clipping hidden tools beyond the viewport', () => {
  renderToolRail(createProps());

  const rail = container?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-rail"]');
  const divider = queryUi('editor.floating.tool-rail.divider.before-frame');

  expect(rail?.className).toContain('max-[720px]:flex-wrap');
  expect(rail?.className).toContain('overflow-visible');
  expect(divider).not.toBeNull();
  expect(divider?.className).not.toContain('max-[720px]:hidden');
});

it('stays centered when the left drawer opens', () => {
  renderToolRail({ ...createProps(), leftDrawerOpen: true });

  const stack = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.stack"]'
  );

  expect(stack?.className).toContain('left-1/2');
  expect(stack?.className).not.toContain('left-[23.75rem]');
});

it('routes undo and redo, then confirms irreversible reset before clearing history', async () => {
  const onBeforeSelectionAwareAction = vi.fn();
  renderToolRail(
    createProps({
      hasImage: true,
      history: { canRedo: true, canUndo: true, index: 2, size: 3 },
      onBeforeSelectionAwareAction,
    })
  );

  const history = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.history"]'
  );
  expect(history).not.toBeNull();
  expect(history?.className).toContain('flex-row');

  await act(async () => {
    getHistoryButton('undo').click();
    getHistoryButton('redo').click();
    getHistoryButton('reset').click();
  });

  expect(controller.resetToOriginal).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain(translate('editor.toolbar.resetOriginalMessage'));

  await act(async () => getDialogButton(translate('editor.toolbar.resetOriginal')).click());

  expect(onBeforeSelectionAwareAction).toHaveBeenCalledTimes(3);
  expect(controller.clearSelection).toHaveBeenCalledTimes(3);
  expect(controller.undo).toHaveBeenCalledOnce();
  expect(controller.redo).toHaveBeenCalledOnce();
  expect(controller.resetToOriginal).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it('cancels reset without mutating the document', () => {
  renderToolRail(createProps({ history: { canRedo: false, canUndo: true, index: 1, size: 2 } }));

  act(() => getHistoryButton('reset').click());
  act(() => getDialogButton(translate('common.actions.cancel')).click());

  expect(controller.clearSelection).not.toHaveBeenCalled();
  expect(controller.resetToOriginal).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it('disables reset at the original history index and keeps the warning tooltip available', () => {
  renderToolRail(createProps({ history: { canRedo: true, canUndo: false, index: 0, size: 2 } }));

  const reset = getHistoryButton('reset');
  expect(reset.disabled).toBe(true);
  expect(reset.title).toBe(translate('editor.toolbar.resetOriginalTooltip'));
  expect(reset.getAttribute('aria-label')).toBe(translate('editor.toolbar.resetOriginalTooltip'));
});

it('keeps document-required controls disabled before an image is loaded', () => {
  const props = createProps({ hasImage: false });
  renderToolRail(props);

  expect(getToolButton('text').disabled).toBe(true);
  const frame = getContentFrameButton('future-frame-style');
  expect(frame.disabled).toBe(true);
  act(() => frame.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(props.onActivateTool).not.toHaveBeenCalled();
});

function getHistoryButton(action: 'undo' | 'redo' | 'reset') {
  const button = container?.querySelector<HTMLButtonElement>(
    `[data-ui="editor.floating.tool-rail.history.${action}"]`
  );
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function rerenderToolRail(
  props: EditorToolbarContentProps & {
    leftDrawerOpen?: boolean;
    onToggleActiveToolOptions?: (tool: EditorTool) => void;
  }
) {
  act(() => {
    root?.render(<EditorFloatingToolRail {...props} />);
  });
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}

function getToolButton(tool: string): HTMLButtonElement {
  const button = queryUi(`editor.floating.tool-rail.${tool}`);
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function getContentFrameButton(id: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`[data-ui="content.toolbar.${id}"]`);
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function getDialogButton(label: string): HTMLButtonElement {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ].find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}
