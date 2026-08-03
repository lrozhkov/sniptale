// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const menuComponentMocks = vi.hoisted(() => ({
  captureActionDropdown: vi.fn(() => null),
  captureActionToggle: vi.fn(() => null),
  timerDropdown: vi.fn(() => null),
  timerToggle: vi.fn(() => null),
  viewportSelector: vi.fn((_props: { onMenuStateChange: (isOpen: boolean) => void }) => null),
}));

vi.mock('./action-dropdown', () => ({
  CaptureActionDropdown: menuComponentMocks.captureActionDropdown,
}));

vi.mock('./timer-dropdown', () => ({
  TimerDropdown: menuComponentMocks.timerDropdown,
}));

vi.mock('./toggle', () => ({
  ToolbarCaptureActionToggle: menuComponentMocks.captureActionToggle,
}));

vi.mock('./timer-toggle', () => ({
  ToolbarTimerToggle: menuComponentMocks.timerToggle,
}));

vi.mock('../../viewport-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport-selector')>()),
  ViewportSelector: menuComponentMocks.viewportSelector,
}));

import { ToolbarCaptureActionMenu, ToolbarTimerMenu, ToolbarViewportMenu } from './menus';
import { useToolbarMenuState, type ToolbarMenuState } from '../state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentToolbarMenuState: ToolbarMenuState | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function ViewportMenuStateHarness() {
  const toolbarMenuState = useToolbarMenuState();
  currentToolbarMenuState = toolbarMenuState;

  return (
    <ToolbarViewportMenu
      closeMenus={toolbarMenuState.closeMenus}
      compactMenus={false}
      currentViewport={null}
      displayMode="horizontal"
      getViewportMenuPosition={() => 'down'}
      isLoading={false}
      onViewportChange={vi.fn()}
      screenshotMode
      setViewportMenuOpen={toolbarMenuState.setViewportMenuOpen}
      viewportSelectorRef={createRef()}
      viewportWrapperRef={createRef()}
    />
  );
}

function getCurrentToolbarMenuState(): ToolbarMenuState {
  if (!currentToolbarMenuState) throw new Error('Toolbar menu state did not render');
  return currentToolbarMenuState;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  currentToolbarMenuState = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentToolbarMenuState = null;
  vi.unstubAllGlobals();
});

describe('toolbar capture menu composition', () => {
  it('renders the exact capture-action dropdown only while its menu is open', async () => {
    const props: React.ComponentProps<typeof ToolbarCaptureActionMenu> = {
      captureAction: 'download_default',
      captureActionOptions: [],
      captureButtonRef: createRef(),
      captureDropdownMenuRef: createRef(),
      captureMenuRef: createRef(),
      closeMenus: vi.fn(),
      compactMenus: false,
      displayMode: 'horizontal',
      getCaptureActionIcon: () => null,
      getMenuPosition: () => 'down',
      onSelect: vi.fn(),
      setShowCaptureMenu: vi.fn(),
      showCaptureMenu: true,
    };

    await renderNode(<ToolbarCaptureActionMenu {...props} />);
    expect(menuComponentMocks.captureActionDropdown).toHaveBeenCalledTimes(1);

    await renderNode(<ToolbarCaptureActionMenu {...props} showCaptureMenu={false} />);
    expect(menuComponentMocks.captureActionDropdown).toHaveBeenCalledTimes(1);
  });

  it('renders the exact timer dropdown only while its menu is open', async () => {
    const props: React.ComponentProps<typeof ToolbarTimerMenu> = {
      closeMenus: vi.fn(),
      compactMenus: false,
      displayMode: 'horizontal',
      getMenuPosition: () => 'down',
      onTimerDelayChange: vi.fn(),
      setShowTimerMenu: vi.fn(),
      showTimerMenu: true,
      timerButtonRef: createRef(),
      timerDelay: 0,
      timerDropdownMenuRef: createRef(),
      timerMenuRef: createRef(),
      timerOptions: [],
    };

    await renderNode(<ToolbarTimerMenu {...props} />);
    expect(menuComponentMocks.timerDropdown).toHaveBeenCalledTimes(1);

    await renderNode(<ToolbarTimerMenu {...props} showTimerMenu={false} />);
    expect(menuComponentMocks.timerDropdown).toHaveBeenCalledTimes(1);
  });

  it('keeps viewport composition behind screenshot mode', async () => {
    const props: React.ComponentProps<typeof ToolbarViewportMenu> = {
      closeMenus: vi.fn(),
      compactMenus: false,
      currentViewport: null,
      displayMode: 'horizontal',
      getViewportMenuPosition: () => 'down',
      isLoading: false,
      onViewportChange: vi.fn(),
      screenshotMode: false,
      setViewportMenuOpen: vi.fn(),
      viewportSelectorRef: createRef(),
      viewportWrapperRef: createRef(),
    };

    await renderNode(<ToolbarViewportMenu {...props} />);
    expect(menuComponentMocks.viewportSelector).not.toHaveBeenCalled();

    await renderNode(<ToolbarViewportMenu {...props} screenshotMode />);
    expect(menuComponentMocks.viewportSelector).toHaveBeenCalledTimes(1);
  });

  it('ignores a delayed viewport close after toolbar settings becomes active', async () => {
    await renderNode(<ViewportMenuStateHarness />);
    act(() => getCurrentToolbarMenuState().setViewportMenuOpen(true));

    const staleViewportStateChange = menuComponentMocks.viewportSelector.mock.lastCall?.[0]
      ?.onMenuStateChange as ((isOpen: boolean) => void) | undefined;
    expect(staleViewportStateChange).toBeTypeOf('function');

    act(() => getCurrentToolbarMenuState().toggleMenu('settings'));
    expect(getCurrentToolbarMenuState().activeMenuType).toBe('settings');

    act(() => staleViewportStateChange?.(false));
    expect(getCurrentToolbarMenuState().activeMenuType).toBe('settings');
  });
});
