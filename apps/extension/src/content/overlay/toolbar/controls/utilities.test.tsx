// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarUtilityButtons } from './utilities';
import { useToolbarMenuState } from '../state/menu';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    framesCount: 1,
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

  it('shows Auto-Blur only in highlighter mode and opens the configure menu action', async () => {
    const props = createProps();
    await renderUtilities({ ...props, highlighterMode: false });
    expect(container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')).toBeNull();

    await renderUtilities(props);
    const autoBlurButton = container?.querySelector('[data-ui="content.toolbar.auto-blur-button"]');
    await act(async () => {
      autoBlurButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const configure = container?.querySelector('[data-ui="content.toolbar.auto-blur-configure"]');
    await act(async () => {
      configure?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(props.autoBlur.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(props.onClearHighlights).not.toHaveBeenCalled();
  });

  it('disables auto-enable when the toolbar is not pinned or scenario-owned', async () => {
    const props = createProps();
    props.autoBlur.autoApplyAllowed = false;
    await renderUtilities(props);

    await act(async () => {
      container
        ?.querySelector('[data-ui="content.toolbar.auto-blur-button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const toggle = container?.querySelector('[data-ui="content.toolbar.auto-blur-toggle"]');
    expect(toggle).toHaveProperty('disabled', true);
    expect(container?.textContent).toContain('content.autoBlur.autoApplyBlockedHint');
  });
});
