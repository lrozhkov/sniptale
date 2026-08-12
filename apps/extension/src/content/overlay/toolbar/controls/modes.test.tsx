// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarModeButtons } from './modes';
import { useToolbarMenuState } from '../state/menu';
import type { ToolbarModeButtonsProps } from './mode-types';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ModeButtonsHarness(params: {
  aiPickMode?: boolean;
  canClearPagePreparation?: boolean;
  designReviewMode?: boolean;
  drawingMode?: boolean;
  onDisableAiPickMode?: () => void;
  onClearPagePreparation?: () => void;
  onSelectPageEditingMode?: (mode: 'block-selection' | 'direct-text' | 'ai') => void;
  onToggleDesignReview?: () => void;
  onToggleDrawing?: () => void;
  onToggleQuickEdit?: () => void;
  onToggleVideoRecording?: (activationEvent?: Event) => Promise<boolean> | boolean | void;
  pendingMode?: 'quick-edit' | 'highlighter' | null;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  videoRecordingMode?: boolean;
}) {
  const toolbarMenuState = useToolbarMenuState();
  const props: ToolbarModeButtonsProps = {
    isCursorMode: true,
    aiPickMode: params.aiPickMode ?? false,
    canClearPagePreparation: params.canClearPagePreparation ?? false,
    designReviewMode: params.designReviewMode ?? false,
    drawingMode: params.drawingMode ?? false,
    videoRecordingMode: params.videoRecordingMode ?? false,
    compactMenus: true,
    displayMode: 'vertical',
    sidebarVisible: true,
    quickEditDocumentMode: params.quickEditDocumentMode ?? false,
    quickEditMode: params.quickEditMode ?? false,
    highlighterMode: false,
    pendingMode: params.pendingMode ?? null,
    toolbarMenuState,
    onEnableCursorMode: vi.fn(),
    onDisableAiPickMode: params.onDisableAiPickMode ?? vi.fn(),
    onClearPagePreparation: params.onClearPagePreparation ?? vi.fn(),
    onSelectPageEditingMode: params.onSelectPageEditingMode ?? vi.fn(),
    onToggleDesignReview: params.onToggleDesignReview ?? vi.fn(),
    onToggleDrawing: params.onToggleDrawing ?? vi.fn(),
    onToggleQuickEdit: params.onToggleQuickEdit ?? vi.fn(),
    onToggleHighlighter: vi.fn(),
    onToggleVideoRecording: params.onToggleVideoRecording ?? vi.fn(),
  };

  return <ToolbarModeButtons {...props} />;
}

function renderModeButtons(
  params: {
    aiPickMode?: boolean;
    canClearPagePreparation?: boolean;
    designReviewMode?: boolean;
    drawingMode?: boolean;
    onDisableAiPickMode?: () => void;
    onClearPagePreparation?: () => void;
    onSelectPageEditingMode?: (mode: 'block-selection' | 'direct-text' | 'ai') => void;
    onToggleDesignReview?: () => void;
    onToggleDrawing?: () => void;
    onToggleQuickEdit?: () => void;
    onToggleVideoRecording?: (activationEvent?: Event) => Promise<boolean> | boolean | void;
    pendingMode?: 'quick-edit' | 'highlighter' | null;
    quickEditDocumentMode?: boolean;
    quickEditMode?: boolean;
    videoRecordingMode?: boolean;
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1240);
  vi.stubGlobal('innerHeight', 900);
});

it('activates Drawing through its distinct Working Mode option', () => {
  const onToggleDrawing = vi.fn();
  renderModeButtons({ onToggleDrawing });
  act(() => queryModeSelectorButton()?.click());
  act(() => {
    document
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.mode-option.drawing"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(onToggleDrawing).toHaveBeenCalledTimes(1);
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

it('shows the clear-all action in Navigation and routes it to the reset owner', () => {
  const onClearPagePreparation = vi.fn();
  renderModeButtons({ canClearPagePreparation: true, onClearPagePreparation });

  const clearButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.navigation.clear-page-preparation"]'
  );
  expect(clearButton?.getAttribute('title')).toBe('content.toolbar.clearPagePreparation');
  expect(clearButton?.querySelector('svg')?.classList.contains('lucide-brush-cleaning')).toBe(true);

  act(() => clearButton?.click());
  expect(onClearPagePreparation).toHaveBeenCalledOnce();
});

it('disables the clear-all action while page preparation history is empty', () => {
  renderModeButtons();
  expect(
    document.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.navigation.clear-page-preparation"]'
    )?.disabled
  ).toBe(true);
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

  expect(directTextIcon?.getAttribute('class')).toContain('lucide-text-cursor');
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
