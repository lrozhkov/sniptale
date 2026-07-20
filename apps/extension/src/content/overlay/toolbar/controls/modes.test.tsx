// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarModeButtons } from './modes';
import { useToolbarMenuState } from '../state/menu';
import type { ToolbarModeButtonsProps } from './mode-types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ModeButtonsHarness(params: {
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
  onToggleQuickEdit?: () => void;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
}) {
  const toolbarMenuState = useToolbarMenuState();
  const props: ToolbarModeButtonsProps = {
    isCursorMode: true,
    aiPickMode: false,
    compactMenus: true,
    displayMode: 'vertical',
    sidebarVisible: true,
    quickEditDocumentMode: params.quickEditDocumentMode ?? false,
    quickEditMode: params.quickEditMode ?? false,
    highlighterMode: false,
    pendingMode: null,
    pageStyleInspectorOpen: params.inspectorOpen ?? false,
    toolbarMenuState,
    onEnableCursorMode: vi.fn(),
    onDisableAiPickMode: vi.fn(),
    onAiPickContentStart: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    onToggleQuickEdit: params.onToggleQuickEdit ?? vi.fn(),
    onToggleHighlighter: vi.fn(),
    ...(params.onToggleInspector === undefined
      ? {}
      : { onTogglePageStyleInspector: params.onToggleInspector }),
  };

  return <ToolbarModeButtons {...props} />;
}

function renderModeButtons(
  params: {
    inspectorOpen?: boolean;
    onToggleInspector?: () => void;
    onToggleQuickEdit?: () => void;
    quickEditDocumentMode?: boolean;
    quickEditMode?: boolean;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ModeButtonsHarness {...params} />);
  });
}

function queryModeSelectorButton(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.mode-selector-button"]');
}

function queryQuickEditModeOption(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.mode-option.quick-edit"]');
}

function queryInspectorButton(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.page-style-inspector-button"]');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1240);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens the vertical mode menu away from the reserved sidebar work area', () => {
  renderModeButtons();

  const trigger = queryModeSelectorButton();

  if (!trigger) {
    throw new Error('Mode selector trigger is missing');
  }

  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: 120,
    left: 860,
    right: 896,
    bottom: 156,
    width: 36,
    height: 36,
    x: 860,
    y: 120,
    toJSON: () => ({}),
  });

  act(() => {
    trigger.click();
  });

  const menuSurface = container?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

  expect(menuSurface?.style.left).toBe('auto');
  expect(menuSurface?.style.right).toBe('calc(100% + 10px)');
});

it('selects a mode option from the menu mousedown action', () => {
  const onToggleQuickEdit = vi.fn();
  renderModeButtons({ onToggleQuickEdit });

  act(() => {
    queryModeSelectorButton()?.click();
  });
  act(() => {
    queryQuickEditModeOption()?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    );
  });

  expect(onToggleQuickEdit).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-ui="content.toolbar.mode-option.quick-edit"]')).toBeNull();
});

it('shows the properties control only in quick-edit mode', () => {
  renderModeButtons({ onToggleInspector: vi.fn() });

  expect(queryInspectorButton()).toBeNull();

  renderModeButtons({ onToggleInspector: vi.fn(), quickEditMode: true });

  expect(queryInspectorButton()?.getAttribute('title')).toBe(
    'content.pageStyleInspector.showProperties'
  );
});

it('disables the properties control while document text editing is active', () => {
  const onToggleInspector = vi.fn();
  renderModeButtons({
    inspectorOpen: true,
    onToggleInspector,
    quickEditDocumentMode: true,
    quickEditMode: true,
  });

  const button = queryInspectorButton();
  act(() => {
    button?.click();
  });

  expect(button?.disabled).toBe(true);
  expect(button?.getAttribute('data-active')).not.toBe('true');
  expect(button?.getAttribute('title')).toBe(
    'content.pageStyleInspector.unavailableDuringDocumentEdit'
  );
  expect(onToggleInspector).not.toHaveBeenCalled();
});

it('reflects open properties panel state and toggles from the toolbar', () => {
  const onToggleInspector = vi.fn();
  renderModeButtons({
    inspectorOpen: true,
    onToggleInspector,
    quickEditMode: true,
  });

  const button = queryInspectorButton();
  act(() => {
    button?.click();
  });

  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(button?.getAttribute('data-active')).toBe('true');
  expect(button?.getAttribute('title')).toBe('content.pageStyleInspector.hideProperties');
  expect(onToggleInspector).toHaveBeenCalledTimes(1);
});
