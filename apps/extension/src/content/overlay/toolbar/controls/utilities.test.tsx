// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarUtilityButtons } from './utilities';
import { useToolbarMenuState } from '../state/menu';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    framesCount: 1,
    futureFrameStyle: {
      blurSettings: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
      borderSettings: DEFAULT_BORDER_PRESET,
      effectMode: 'border' as const,
      focusSettings: { opacity: 0.5, showBorder: false },
    },
    highlighterMode: true,
    isCursorMode: false,
    isLoading: false,
    lockDisabled: false,
    navigationLockEnabled: false,
    autoBlur: {
      autoApplyAllowed: true,
      autoApplyEnabled: false,
      isApplying: false,
      onApplyOnce: vi.fn(async () => undefined),
      onOpenAutoApplySettings: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleAutoApply: vi.fn(async () => undefined),
    },
    compactMenus: false,
    displayMode: 'horizontal' as const,
    onClearHighlights: vi.fn(),
    onFutureFrameEffectModeChange: vi.fn(),
    sidebarVisible: false,
    screenshotMode: false,
    toggleNavigationLock: vi.fn(),
  };
}

async function renderUtilities(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ToolbarUtilityButtonsHarness {...props} />);
  });
}

function ToolbarUtilityButtonsHarness(props: ReturnType<typeof createProps>) {
  const toolbarMenuState = useToolbarMenuState();

  return <ToolbarUtilityButtons {...props} toolbarMenuState={toolbarMenuState} />;
}

describe('ToolbarUtilityButtons', () => {
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

  it('shows sensitive-data blur in highlighter mode and opens the configure menu action', async () => {
    const props = createProps();
    await renderUtilities({ ...props, highlighterMode: false });
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')).toBeNull();

    await renderUtilities(props);
    expect(
      container?.querySelector('[data-ui="shared.ui.content-toolbar-group"]')?.className
    ).toContain('sniptale-toolbar-highlighter-utilities');
    expect(
      container?.querySelector('[data-ui="content.toolbar.annotation-divider"]')
    ).not.toBeNull();
    const autoBlurButton = container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]');
    expect(autoBlurButton?.parentElement?.className).toContain(
      'sniptale-toolbar-privacy-group-start'
    );
    expect(autoBlurButton?.querySelector('svg')?.getAttribute('class')).toContain(
      'lucide-shield-check'
    );
    await act(async () => {
      autoBlurButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(autoBlurButton?.getAttribute('data-active')).toBeNull();
    expect(
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-toggle"] svg')
        ?.getAttribute('class')
    ).toContain('lucide-shield-check');
    expect(
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-apply-once"] svg')
        ?.getAttribute('class')
    ).toContain('lucide-scan-search');
    const configure = container?.querySelector('[data-ui="content.toolbar.auto-blur-configure"]');
    expect(configure?.querySelector('svg')?.getAttribute('class')).toContain(
      'lucide-sliders-horizontal'
    );
    await act(async () => {
      configure?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(props.autoBlur.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(props.onClearHighlights).not.toHaveBeenCalled();
  });

  it('shows only sensitive-data blur beside Cursor while pin or scenario allows it', async () => {
    const props = createProps();

    await renderUtilities({ ...props, highlighterMode: false, isCursorMode: true });
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="content.toolbar.clear-frames-button"]')).toBeNull();
    expect(container?.querySelectorAll('button')).toHaveLength(1);

    props.autoBlur.autoApplyAllowed = false;
    await renderUtilities({ ...props, highlighterMode: false, isCursorMode: true });
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')).toBeNull();
  });

  it('disables auto-enable when the toolbar is not pinned or scenario-owned', async () => {
    const props = createProps();
    props.autoBlur.autoApplyAllowed = false;
    await renderUtilities({ ...props, compactMenus: true });

    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const toggle = container?.querySelector('[data-ui="content.toolbar.auto-blur-toggle"]');
    expect(toggle).toHaveProperty('disabled', true);
    expect(container?.textContent).toContain('content.autoBlur.autoApplyBlockedHint');
    expect(
      toggle?.querySelector('.sniptale-toolbar-menu-item-hint')?.getAttribute('class')
    ).toContain('sniptale-toolbar-menu-item-hint--show-compact');
  });

  it('opens configuration before enabling auto-blur and directly toggles only an enabled mode', async () => {
    const props = createProps();
    await renderUtilities(props);
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-toggle"]')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(props.autoBlur.onOpenAutoApplySettings).toHaveBeenCalledOnce();
    expect(props.autoBlur.onToggleAutoApply).not.toHaveBeenCalled();

    props.autoBlur.autoApplyEnabled = true;
    await renderUtilities(props);
    expect(
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.getAttribute('data-active')
    ).toBe('true');
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-toggle"]')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(props.autoBlur.onToggleAutoApply).toHaveBeenCalledOnce();
  });

  it('closes the sensitive-data blur menu when the pointer moves far away', async () => {
    await renderUtilities(createProps());
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const menu = container?.querySelector<HTMLElement>(
      '[data-ui="content.toolbar.auto-blur-menu"] .sniptale-popover-menu'
    );
    expect(menu).not.toBeNull();
    vi.spyOn(menu!, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 100,
      left: 100,
      right: 300,
      top: 100,
      width: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 620, clientY: 520 })
      );
    });

    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-menu"]')).toBeNull();
  });

  it('closes the menu before a full-page blur scan begins waiting', async () => {
    let finishScan!: () => void;
    const props = createProps();
    props.autoBlur.onApplyOnce.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          finishScan = () => resolve(undefined);
        })
    );
    await renderUtilities(props);
    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-apply-once"]')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(props.autoBlur.onApplyOnce).toHaveBeenCalledOnce();
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-menu"]')).toBeNull();
    finishScan();
  });
});
