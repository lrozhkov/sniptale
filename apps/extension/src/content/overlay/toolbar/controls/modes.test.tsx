// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarModeButtons } from './modes';
import { useToolbarMenuState } from '../state/menu';
import type { ToolbarModeButtonsProps } from './mode-types';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';

const trustedKeyboard = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: trustedKeyboard,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../ai/text-rewrite/view', () => ({
  TextRewriteControl: (props: {
    visible: boolean;
    active: boolean;
    onActiveChange(active: boolean): void;
  }) =>
    props.visible ? (
      <button
        data-ui="content.toolbar.ai-text"
        aria-pressed={props.active}
        onClick={() => props.onActiveChange(!props.active)}
      />
    ) : null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ModeButtonsHarness(params: {
  aiPickMode?: boolean;
  designReviewMode?: boolean;
  drawingMode?: boolean;
  onDisableAiPickMode?: () => void;
  onSelectPageEditingMode?: (mode: 'block-selection' | 'direct-text' | 'ai') => void;
  onToggleDesignReview?: () => void;
  onToggleDrawing?: () => void;
  onToggleQuickEdit?: () => void;
  onToggleVideoRecording?: (activationEvent?: Event) => Promise<boolean> | boolean | void;
  pendingMode?: 'quick-edit' | 'highlighter' | null;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  videoRecordingMode?: boolean;
  videoRecordingModeLocked?: boolean;
  onEnableCursorMode?: () => void;
  onToggleHighlighter?: () => void;
  isCursorMode?: boolean;
}) {
  const toolbarMenuState = useToolbarMenuState();
  const props: ToolbarModeButtonsProps = {
    isCursorMode: params.isCursorMode ?? true,
    aiPickMode: params.aiPickMode ?? false,
    designReviewMode: params.designReviewMode ?? false,
    drawingMode: params.drawingMode ?? false,
    videoRecordingMode: params.videoRecordingMode ?? false,
    videoRecordingModeLocked: params.videoRecordingModeLocked ?? false,
    compactMenus: true,
    displayMode: 'vertical',
    sidebarVisible: true,
    quickEditDocumentMode: params.quickEditDocumentMode ?? false,
    quickEditMode: params.quickEditMode ?? false,
    highlighterMode: false,
    pendingMode: params.pendingMode ?? null,
    toolbarMenuState,
    onEnableCursorMode: params.onEnableCursorMode ?? vi.fn(),
    onDisableAiPickMode: params.onDisableAiPickMode ?? vi.fn(),
    onSelectPageEditingMode: params.onSelectPageEditingMode ?? vi.fn(),
    onToggleDesignReview: params.onToggleDesignReview ?? vi.fn(),
    onToggleDrawing: params.onToggleDrawing ?? vi.fn(),
    onToggleQuickEdit: params.onToggleQuickEdit ?? vi.fn(),
    onToggleHighlighter: params.onToggleHighlighter ?? vi.fn(),
    onToggleVideoRecording: params.onToggleVideoRecording ?? vi.fn(),
  };

  return (
    <>
      <button data-ui="test.other-menu" onClick={() => toolbarMenuState.setActiveMenuType('timer')}>
        Timer
      </button>
      <ToolbarModeButtons {...props} />
    </>
  );
}

function renderModeButtons(
  params: {
    aiPickMode?: boolean;
    designReviewMode?: boolean;
    drawingMode?: boolean;
    onDisableAiPickMode?: () => void;
    onSelectPageEditingMode?: (mode: 'block-selection' | 'direct-text' | 'ai') => void;
    onToggleDesignReview?: () => void;
    onToggleDrawing?: () => void;
    onToggleQuickEdit?: () => void;
    onToggleVideoRecording?: (activationEvent?: Event) => Promise<boolean> | boolean | void;
    pendingMode?: 'quick-edit' | 'highlighter' | null;
    quickEditDocumentMode?: boolean;
    quickEditMode?: boolean;
    videoRecordingMode?: boolean;
    videoRecordingModeLocked?: boolean;
    onEnableCursorMode?: () => void;
    onToggleHighlighter?: () => void;
    isCursorMode?: boolean;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <CommandPressScope value={!params.videoRecordingMode}>
        <ModeButtonsHarness {...params} />
      </CommandPressScope>
    );
  });
}

function queryModeSelectorButton(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.mode-selector-button"]');
}

function queryQuickEditModeOption(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.mode-option.quick-edit"]');
}

beforeEach(() => {
  trustedKeyboard.mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    0: new DOMRect(0, 0, 32, 32),
    length: 1,
    item: () => null,
    [Symbol.iterator]: () => [new DOMRect(0, 0, 32, 32)][Symbol.iterator](),
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1240);
  vi.stubGlobal('innerHeight', 900);
});

it('activates Drawing through its distinct Working Mode option', () => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing });
  expect(queryModeSelectorButton()?.getAttribute('data-command-property')).toBe('true');
  act(() => queryModeSelectorButton()?.click());
  expect(document.querySelector('.sniptale-content-menu-adopted')).not.toBeNull();
  act(() => {
    document
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.mode-option.drawing"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(onToggleDrawing).toHaveBeenCalledTimes(1);
});

it('shows the selected mode without a persistent focus-like active frame', () => {
  renderModeButtons({ drawingMode: true });
  const trigger = queryModeSelectorButton();
  expect(trigger?.getAttribute('aria-label')).toBe('content.toolbar.drawingLabel');
  expect(trigger?.querySelector('.sniptale-toolbar-mode-icon')).not.toBeNull();
  expect(trigger?.classList.contains('sniptale-glass-toolbar-button--active')).toBe(false);
  expect(trigger?.getAttribute('data-active')).toBeNull();
  act(() => trigger?.click());
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(trigger?.classList.contains('sniptale-glass-toolbar-button--active')).toBe(false);
});

it('activates Video Recording from the real mode-menu mousedown event', () => {
  const onToggleVideoRecording = vi.fn();
  renderModeButtons({ onToggleVideoRecording });
  act(() => queryModeSelectorButton()?.click());
  const activationEvent = createBridgedMouseEvent(
    'mousedown',
    new MouseEvent('pointerdown', { button: 0, buttons: 1 })
  );

  act(() => {
    document
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.mode-option.video-recording"]')
      ?.dispatchEvent(activationEvent);
  });

  expect(onToggleVideoRecording).toHaveBeenCalledWith(activationEvent);
  expect(
    document.querySelector('[data-ui="content.toolbar.mode-option.video-recording"]')
  ).toBeNull();
});

it('deactivates an active Video Recording surface before selecting another working mode', async () => {
  const onToggleVideoRecording = vi.fn().mockResolvedValue(true);
  const onToggleQuickEdit = vi.fn();
  renderModeButtons({ videoRecordingMode: true, onToggleVideoRecording, onToggleQuickEdit });
  act(() => queryModeSelectorButton()?.click());

  await act(async () => {
    queryQuickEditModeOption()?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });

  expect(onToggleVideoRecording).toHaveBeenCalledOnce();
  expect(onToggleQuickEdit).toHaveBeenCalledOnce();
});

it('restores Drawing when it is selected after deactivating Video Recording', async () => {
  const onToggleVideoRecording = vi.fn().mockResolvedValue(true);
  const onToggleDrawing = vi.fn();
  renderModeButtons({ videoRecordingMode: true, onToggleVideoRecording, onToggleDrawing });
  act(() => queryModeSelectorButton()?.click());

  await act(async () => {
    document
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.mode-option.drawing"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });

  expect(onToggleVideoRecording).toHaveBeenCalledOnce();
  expect(onToggleDrawing).toHaveBeenCalledOnce();
});

it('keeps Navigation free of duplicate reset actions', () => {
  renderModeButtons();
  expect(
    document.querySelector('[data-ui="content.toolbar.navigation.clear-page-preparation"]')
  ).toBeNull();
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
  expect(menuSurface?.style.zIndex).toBe('2147483647');
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

it('orders Working Mode options as Cursor, Drawing, Annotations, Content Editing, and Design Review', () => {
  renderModeButtons();

  expect(
    container?.querySelector('[data-ui="shared.ui.content-toolbar-group"]')?.className
  ).toContain('sniptale-mode-selector-group');
  expect(container?.querySelector('[data-ui="content.toolbar.mode-leading-divider"]')).toBeNull();

  act(() => {
    queryModeSelectorButton()?.click();
  });

  const modes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ui^="content.toolbar.mode-option."]')
  ).map((option) => option.dataset['ui']);
  expect(modes).toEqual([
    'content.toolbar.mode-option.cursor',
    'content.toolbar.mode-option.drawing',
    'content.toolbar.mode-option.highlighter',
    'content.toolbar.mode-option.quick-edit',
    'content.toolbar.mode-option.design-review',
    'content.toolbar.mode-option.video-recording',
  ]);
});

it('separates non-cursor mode tools without duplicating the cursor capture divider', () => {
  renderModeButtons({ pendingMode: 'highlighter' });

  expect(
    container?.querySelector('[data-ui="content.toolbar.mode-leading-divider"]')
  ).not.toBeNull();
});

it('keeps video mode selector directly adjacent to toolbar settings', () => {
  renderModeButtons({ videoRecordingMode: true });

  expect(container?.querySelector('[data-ui="content.toolbar.mode-leading-divider"]')).toBeNull();
});

it('closes the menu without toggling off the already selected mode', () => {
  const onToggleQuickEdit = vi.fn();
  renderModeButtons({ onToggleQuickEdit, quickEditMode: true });

  act(() => {
    queryModeSelectorButton()?.click();
  });
  act(() => {
    queryQuickEditModeOption()?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    );
  });

  expect(onToggleQuickEdit).not.toHaveBeenCalled();
  expect(document.querySelector('[data-ui="content.toolbar.mode-option.quick-edit"]')).toBeNull();
  expect(queryModeSelectorButton()?.getAttribute('title')).toBe('content.toolbar.quickEditLabel');
});

it('offers Design Review as a standalone mode and no longer adds a Quick Edit inspector button', () => {
  const onToggleDesignReview = vi.fn();
  renderModeButtons({ onToggleDesignReview, quickEditMode: true });

  expect(document.querySelector('[data-ui="content.toolbar.design-review-button"]')).toBeNull();
  act(() => queryModeSelectorButton()?.click());
  const option = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.mode-option.design-review"]'
  );
  act(() => {
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });

  expect(onToggleDesignReview).toHaveBeenCalledOnce();
});

it('uses the annotation glyph instead of the border glyph', () => {
  renderModeButtons();
  act(() => queryModeSelectorButton()?.click());

  const icon = document.querySelector('[data-ui="content.toolbar.mode-option.highlighter"] svg');
  expect(icon?.getAttribute('class')).toContain('lucide-message-square-plus');
  expect(icon?.getAttribute('class')).not.toContain('lucide-square');
});

it('keeps AI Editor out of Working Mode and groups it under Content Editing', () => {
  renderModeButtons({ aiPickMode: true });

  expect(queryModeSelectorButton()?.getAttribute('title')).toBe('content.toolbar.quickEditLabel');
  expect(
    document
      .querySelector('[data-ui="content.toolbar.page-editing-mode.ai"]')
      ?.getAttribute('data-active')
  ).toBe('true');
  expect(
    document.querySelector('[data-ui="content.toolbar.page-editing-mode.block-selection"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-ui="content.toolbar.page-editing-mode.direct-text"]')
  ).not.toBeNull();

  act(() => queryModeSelectorButton()?.click());

  expect(document.querySelector('[data-ui="content.toolbar.mode-option.ai"]')).toBeNull();
});

it('uses direct-edit and AI glyphs that describe their distinct actions', () => {
  renderModeButtons({ quickEditMode: true });

  const directTextIcon = document.querySelector(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"] svg'
  );
  const aiIcon = document.querySelector('[data-ui="content.toolbar.page-editing-mode.ai"] svg');

  expect(directTextIcon?.getAttribute('class')).toContain('tabler-cursor-text');
  expect(directTextIcon?.getAttribute('aria-hidden')).toBe('true');
  expect(directTextIcon?.getAttribute('width')).toBe('18');
  expect(directTextIcon?.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
  expect(aiIcon?.getAttribute('class')).toContain('lucide-bot');
});

it('routes all three mutually exclusive Content Editing choices through one selector action', () => {
  const onSelectPageEditingMode = vi.fn();
  renderModeButtons({ onSelectPageEditingMode, quickEditMode: true });

  const blockSelection = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.block-selection"]'
  );
  const directText = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"]'
  );
  const ai = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.ai"]'
  );

  expect(blockSelection?.getAttribute('data-active')).toBe('true');
  expect(directText?.getAttribute('aria-pressed')).toBe('false');
  expect(ai?.getAttribute('aria-pressed')).toBe('false');

  act(() => directText?.click());
  act(() => ai?.click());

  expect(onSelectPageEditingMode).toHaveBeenNthCalledWith(1, 'direct-text');
  expect(onSelectPageEditingMode).toHaveBeenNthCalledWith(2, 'ai');
});

it('retains keyboard focus and activation on a Page Editing button', () => {
  const onSelectPageEditingMode = vi.fn();
  renderModeButtons({ onSelectPageEditingMode, quickEditMode: true });
  const directText = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"]'
  );
  act(() => directText?.focus());
  expect(document.activeElement).toBe(directText);
  act(() => directText?.click());
  expect(document.activeElement).toBe(directText);
  expect(onSelectPageEditingMode).toHaveBeenCalledWith('direct-text');
});

it('keeps the page edit focused when a Page Editing mode is clicked with the mouse', () => {
  const onSelectPageEditingMode = vi.fn();
  renderModeButtons({
    onSelectPageEditingMode,
    quickEditDocumentMode: true,
    quickEditMode: true,
  });
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.tabIndex = 0;
  document.body.append(editor);
  editor.focus();
  const directText = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"]'
  );
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    directText?.dispatchEvent(press);
    directText?.click();
  });
  expect(press.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(editor);
  expect(onSelectPageEditingMode).toHaveBeenCalledWith('direct-text');
});

it('blocks conflicting Content Editing actions while the AI transition is pending', () => {
  const onDisableAiPickMode = vi.fn();
  const onSelectPageEditingMode = vi.fn();
  renderModeButtons({
    aiPickMode: true,
    onDisableAiPickMode,
    onSelectPageEditingMode,
    pendingMode: 'quick-edit',
  });

  const selector = queryModeSelectorButton();
  const blockSelection = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.block-selection"]'
  );
  const directText = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"]'
  );
  const ai = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.ai"]'
  );

  expect(selector?.disabled).toBe(true);
  expect(blockSelection?.disabled).toBe(true);
  expect(directText?.disabled).toBe(true);
  expect(ai?.disabled).toBe(true);

  act(() => {
    selector?.click();
    directText?.click();
  });

  expect(onDisableAiPickMode).not.toHaveBeenCalled();
  expect(onSelectPageEditingMode).not.toHaveBeenCalled();
  expect(document.querySelector('[data-ui="content.toolbar.mode-option.quick-edit"]')).toBeNull();
});

it('removes old editing submodes during the requested annotation transition and restores on refusal', () => {
  renderModeButtons({ quickEditMode: true });
  expect(document.querySelector('.sniptale-page-editing-mode-group')).not.toBeNull();
  renderModeButtons({ quickEditMode: true, pendingMode: 'highlighter' });
  expect(document.querySelector('.sniptale-page-editing-mode-group')).toBeNull();
  renderModeButtons({ quickEditMode: true });
  expect(document.querySelector('.sniptale-page-editing-mode-group')).not.toBeNull();
});

it('projects requested editing submodes before the previous runtime mode finishes', () => {
  renderModeButtons({ drawingMode: true, pendingMode: 'quick-edit' });
  const group = document.querySelector('.sniptale-page-editing-mode-group');
  expect(group).not.toBeNull();
  expect([...group!.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
});

it('keeps the marker and the single-text AI picker mutually exclusive within Content Editing', () => {
  const selectMode = vi.fn();
  renderModeButtons({ onSelectPageEditingMode: selectMode, quickEditMode: true });
  const marker = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.text-marker"]'
  );
  const textAI = document.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.ai-text"]');
  const direct = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.page-editing-mode.direct-text"]'
  );
  act(() => marker?.click());
  expect(marker?.getAttribute('aria-pressed')).toBe('true');
  act(() => textAI?.click());
  expect(marker?.getAttribute('aria-pressed')).toBe('false');
  expect(textAI?.getAttribute('aria-pressed')).toBe('true');
  act(() => direct?.click());
  expect(textAI?.getAttribute('aria-pressed')).toBe('false');
  expect(selectMode).toHaveBeenLastCalledWith('direct-text');
});

function pressDigit(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it('shows the current name and six discoverable digit choices beside the mode glyphs', () => {
  renderModeButtons({ drawingMode: true });
  expect(queryModeSelectorButton()?.textContent).toContain('content.toolbar.drawingLabel');
  act(() => queryModeSelectorButton()?.click());
  const options = [...document.querySelectorAll('[data-ui^="content.toolbar.mode-option."]')];
  expect(options.map((option) => option.querySelector('kbd')?.textContent)).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
  ]);
  expect(options.every((option) => option.querySelector('svg'))).toBe(true);
});

it.each(['1', '2', '3', '4', '5', '6'])('selects mode %s through its existing callback', (key) => {
  const callbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()] as const;
  renderModeButtons({
    drawingMode: key === '1',
    isCursorMode: key !== '1',
    onEnableCursorMode: callbacks[0],
    onToggleDrawing: callbacks[1],
    onToggleHighlighter: callbacks[2],
    onToggleQuickEdit: callbacks[3],
    onToggleDesignReview: callbacks[4],
    onToggleVideoRecording: callbacks[5],
  });
  const event = pressDigit(key);
  expect(callbacks.map((callback) => callback.mock.calls.length)).toEqual(
    callbacks.map((_, index) => (index === Number(key) - 1 ? 1 : 0))
  );
  if (key === '6') expect(callbacks[5]).toHaveBeenCalledWith(event);
  expect(event.defaultPrevented).toBe(true);
});

it.each([
  { ctrlKey: true },
  { altKey: true },
  { metaKey: true },
  { shiftKey: true },
  { repeat: true },
  { isComposing: true },
  { key: '7' },
])('leaves modified, repeated, composing and unrelated input untouched: %j', (init) => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing });
  expect(pressDigit('2', init).defaultPrevented).toBe(false);
  expect(onToggleDrawing).not.toHaveBeenCalled();
});

it('refuses untrusted events and keys already claimed by another owner', () => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing });
  trustedKeyboard.mockReturnValue(false);
  expect(pressDigit('2').defaultPrevented).toBe(false);
  trustedKeyboard.mockReturnValue(true);
  const event = new KeyboardEvent('keydown', { key: '2', cancelable: true });
  event.preventDefault();
  act(() => {
    window.dispatchEvent(event);
  });
  expect(onToggleDrawing).not.toHaveBeenCalled();
});

it.each(['input', 'textarea', 'select', 'contenteditable', 'textbox', 'shadow-input'])(
  'preserves digit input in %s',
  (kind) => {
    const onToggleDrawing = vi.fn();
    renderModeButtons({ onToggleDrawing });
    const target = document.createElement(
      ['input', 'textarea', 'select'].includes(kind) ? kind : 'div'
    );
    if (kind === 'contenteditable') target.setAttribute('contenteditable', 'true');
    if (kind === 'textbox') target.setAttribute('role', 'textbox');
    document.body.append(target);
    const input =
      kind === 'shadow-input'
        ? target.attachShadow({ mode: 'open' }).appendChild(document.createElement('input'))
        : target;
    expect(pressDigit('2', {}, input).defaultPrevented).toBe(false);
    expect(onToggleDrawing).not.toHaveBeenCalled();
  }
);

it('keeps digits inside another open toolbar menu and permits them inside the mode menu', () => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing });
  act(() => container!.querySelector<HTMLButtonElement>('[data-ui="test.other-menu"]')!.click());
  expect(pressDigit('2').defaultPrevented).toBe(false);
  expect(onToggleDrawing).not.toHaveBeenCalled();
  act(() => queryModeSelectorButton()?.click());
  const event = pressDigit('2');
  expect(event.defaultPrevented).toBe(true);
  expect(onToggleDrawing).toHaveBeenCalledOnce();
  expect(document.querySelector('[data-ui="content.toolbar.mode-option.drawing"]')).toBeNull();
});

it.each(['dialog', 'listbox', 'customizing', 'dragging', 'inert', 'hidden', 'pending', 'locked'])(
  'does not change modes while %s owns the interaction',
  (kind) => {
    const onToggleDrawing = vi.fn();
    renderModeButtons({
      onToggleDrawing,
      pendingMode: kind === 'pending' ? 'quick-edit' : null,
      videoRecordingMode: kind === 'locked',
      videoRecordingModeLocked: kind === 'locked',
    });
    if (kind === 'dialog' || kind === 'listbox') {
      const layer = document.createElement('div');
      layer.setAttribute('role', kind);
      document.body.append(layer);
    } else if (kind === 'customizing') container!.setAttribute('data-page-customizing', 'true');
    else if (kind === 'dragging') container!.setAttribute('data-dragging', 'true');
    else if (kind === 'inert') container!.setAttribute('inert', '');
    else if (kind === 'hidden') queryModeSelectorButton()!.style.visibility = 'hidden';
    expect(pressDigit('2').defaultPrevented).toBe(false);
    expect(onToggleDrawing).not.toHaveBeenCalled();
  }
);

it('ignores a selected mode, hidden toolbar geometry and a disposed toolbar', () => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing, drawingMode: true });
  expect(pressDigit('2').defaultPrevented).toBe(true);
  expect(onToggleDrawing).not.toHaveBeenCalled();
  vi.spyOn(queryModeSelectorButton()!, 'getClientRects').mockReturnValue({
    length: 0,
    item: () => null,
    [Symbol.iterator]: () => [][Symbol.iterator](),
  });
  expect(pressDigit('1').defaultPrevented).toBe(false);
  act(() => root!.unmount());
  root = null;
  expect(pressDigit('2').defaultPrevented).toBe(false);
});

it.each(['refused', 'rejected', 'accepted'])(
  'preserves the async recording exit contract when %s',
  async (outcome) => {
    const onToggleDrawing = vi.fn();
    let resolve!: (value: boolean) => void;
    let reject!: (reason: Error) => void;
    const onToggleVideoRecording = vi.fn(
      () =>
        new Promise<boolean>((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    renderModeButtons({ onToggleDrawing, onToggleVideoRecording, videoRecordingMode: true });
    const event = pressDigit('2');
    expect(onToggleVideoRecording).toHaveBeenCalledWith(event);
    expect(onToggleDrawing).not.toHaveBeenCalled();
    await act(async () => {
      if (outcome === 'rejected') reject(new Error('Exit refused'));
      else resolve(outcome === 'accepted');
    });
    expect(onToggleDrawing).toHaveBeenCalledTimes(outcome === 'accepted' ? 1 : 0);
  }
);

it('respects recording customization disabled fieldsets and resumes after customization', async () => {
  const onToggleDrawing = vi.fn();
  const onToggleVideoRecording = vi.fn();
  renderModeButtons({ onToggleDrawing, onToggleVideoRecording, videoRecordingMode: true });
  const fieldset = document.createElement('fieldset');
  fieldset.disabled = true;
  document.body.append(fieldset);
  fieldset.append(container!);
  expect(queryModeSelectorButton()!.disabled).toBe(false);
  expect(queryModeSelectorButton()!.matches(':disabled')).toBe(true);
  expect(pressDigit('2').defaultPrevented).toBe(false);
  expect(onToggleVideoRecording).not.toHaveBeenCalled();
  expect(onToggleDrawing).not.toHaveBeenCalled();
  fieldset.disabled = false;
  await act(async () => {
    pressDigit('2');
  });
  expect(onToggleVideoRecording).toHaveBeenCalledOnce();
  expect(onToggleDrawing).toHaveBeenCalledOnce();
});
