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

  it('shows sensitive-data blur only in highlighter mode and opens the configure menu action', async () => {
    const props = createProps();
    await renderUtilities({ ...props, highlighterMode: false });
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')).toBeNull();

    await renderUtilities(props);
    const autoBlurButton = container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]');
    expect(autoBlurButton?.querySelector('svg')?.getAttribute('class')).toContain(
      'lucide-shield-check'
    );
    await act(async () => {
      autoBlurButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
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
});
