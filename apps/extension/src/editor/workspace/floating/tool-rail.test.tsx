// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

function createProps(
  overrides: Partial<EditorToolbarContentProps> = {}
): EditorToolbarContentProps {
  return {
    activeTool: 'select',
    gridEnabled: false,
    hasImage: true,
    history: { canRedo: false, canUndo: false },
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

function renderToolRail(props: EditorToolbarContentProps & { leftDrawerOpen?: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditorFloatingToolRail {...props} />);
  });
}

function getButton(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`);
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
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
  vi.unstubAllGlobals();
});

it('routes primary, raster, and inspector actions from the floating rail', () => {
  const props = createProps();
  renderToolRail(props);

  expect(queryUi('editor.floating.tool-rail.text')).not.toBeNull();
  expect(queryUi('editor.floating.tool-rail.eraser')).not.toBeNull();
  act(() => {
    getButton(translate('editor.tools.text')).click();
    getButton(translate('editor.tools.eraser')).click();
    getButton(translate('editor.toolbar.resize')).click();
    getButton(translate('editor.toolbar.frame')).click();
  });

  expect(props.onActivateTool).toHaveBeenCalledWith('text');
  expect(props.onActivateTool).toHaveBeenCalledWith('eraser');
  expect(props.onActivateTool).not.toHaveBeenCalledWith('crop');
  expect(props.onToggleInspector).toHaveBeenCalledWith('canvas-size');
  expect(props.onToggleInspector).toHaveBeenCalledWith('frame');
});

it('uses a centered compact rail instead of a full-height column', () => {
  renderToolRail(createProps());

  const stack = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.stack"]'
  );
  const rail = container?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-rail"]');

  expect(stack?.className).toContain('top-1/2');
  expect(stack?.className).toContain('-translate-y-1/2');
  expect(rail?.className).toContain('max-h-[calc(100vh-13rem)]');
  expect(rail?.className).not.toContain('bottom-[5.25rem]');
});

it('wraps the mobile rail instead of clipping hidden tools beyond the viewport', () => {
  renderToolRail(createProps());

  const rail = container?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-rail"]');
  const divider = rail?.querySelector<HTMLElement>('.max-\\[720px\\]\\:hidden');

  expect(rail?.className).toContain('max-[720px]:flex-wrap');
  expect(rail?.className).toContain('max-[720px]:overflow-visible');
  expect(divider).not.toBeNull();
});

it('shifts right when the left drawer is open on desktop', () => {
  renderToolRail({ ...createProps(), leftDrawerOpen: true });

  const stack = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.stack"]'
  );

  expect(stack?.className).toContain('min-[721px]:left-[23.75rem]');
});

it('renders undo, redo, and reset under the left tool rail and routes actions', async () => {
  const onBeforeSelectionAwareAction = vi.fn();
  renderToolRail(
    createProps({
      hasImage: true,
      history: { canRedo: true, canUndo: true },
      onBeforeSelectionAwareAction,
    })
  );

  const history = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-rail.history"]'
  );
  expect(history).not.toBeNull();
  expect(history?.className).toContain('flex-col');
  expect(history?.className).toContain('max-[720px]:!hidden');

  await act(async () => {
    getHistoryButton('undo').click();
    getHistoryButton('redo').click();
    getHistoryButton('reset').click();
  });

  expect(onBeforeSelectionAwareAction).toHaveBeenCalledTimes(3);
  expect(controller.clearSelection).toHaveBeenCalledTimes(3);
  expect(controller.undo).toHaveBeenCalledOnce();
  expect(controller.redo).toHaveBeenCalledOnce();
  expect(controller.resetToOriginal).toHaveBeenCalledOnce();
});

it('keeps document-required controls disabled before an image is loaded', () => {
  renderToolRail(createProps({ hasImage: false }));

  expect(
    getButton(
      `${translate('editor.tools.text')} · ${translate('editor.toolbar.documentRequiredReason')}`
    ).disabled
  ).toBe(true);
});

function getHistoryButton(action: 'undo' | 'redo' | 'reset') {
  const button = container?.querySelector<HTMLButtonElement>(
    `[data-ui="editor.floating.tool-rail.history.${action}"]`
  );
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}
