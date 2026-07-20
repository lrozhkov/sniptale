// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarCaptureActionGroup } from './group';
import type { ToolbarMenuState } from '../state/menu';

vi.mock('./options', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./options')>()),
  ToolbarCaptureButtons: () => <div data-ui="test.capture-buttons" />,
}));

vi.mock('./menu-group', () => ({
  ToolbarCaptureMenuGroup: () => <div data-ui="test.capture-menu-group" />,
}));

vi.mock('./history', () => ({
  ToolbarHistoryControls: () => <div data-ui="test.history-controls" />,
}));

vi.mock('./settings', () => ({
  ToolbarSettingsMenu: () => <div data-ui="test.settings-menu" />,
}));

vi.mock('./use-menus', () => ({
  useToolbarCaptureMenus: () => ({
    activeMenuType: null,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createClosedToolbarMenuState(): ToolbarMenuState {
  return {
    activeMenuType: null,
    showCaptureMenu: false,
    showTimerMenu: false,
    viewportMenuOpen: false,
    closeMenu: vi.fn(),
    closeMenus: vi.fn(),
    setActiveMenuType: vi.fn(),
    setShowCaptureMenu: vi.fn(),
    setShowTimerMenu: vi.fn(),
    setViewportMenuOpen: vi.fn(),
    toggleMenu: vi.fn(),
  };
}

function renderGroup(screenshotMode = true) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ToolbarCaptureActionGroup
        screenshotMode={screenshotMode}
        isLoading={false}
        captureAction="download_default"
        compactMenus={false}
        displayMode="vertical"
        pinToTab={false}
        pinToTabLocked={false}
        onCompactMenusChange={() => undefined}
        onDisplayModeChange={() => undefined}
        onPinToTabChange={() => undefined}
        onCaptureActionChange={() => undefined}
        onClose={() => undefined}
        onDisableScreenshotMode={() => undefined}
        timerDelay={0}
        onTimerDelayChange={() => undefined}
        currentViewport={null}
        onViewportChange={() => undefined}
        toolbarMenuState={createClosedToolbarMenuState()}
        onTakeScreenshot={() => undefined}
        menus={{ activeMenuType: null } as never}
        onSelectCaptureAction={async () => undefined}
      />
    );
  });
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

describe('ToolbarCaptureActionGroup', () => {
  it('renders history controls between viewport actions and settings', () => {
    renderGroup(true);

    const orderedDataUi = Array.from(container?.querySelectorAll('[data-ui]') ?? []).map((node) =>
      node.getAttribute('data-ui')
    );

    expect(orderedDataUi.indexOf('test.capture-menu-group')).toBeLessThan(
      orderedDataUi.indexOf('content.toolbar.history-group')
    );
    expect(orderedDataUi.indexOf('content.toolbar.history-group')).toBeLessThan(
      orderedDataUi.indexOf('content.toolbar.settings-group')
    );
    expect(container?.querySelector('[data-ui="test.history-controls"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="test.settings-menu"]')).not.toBeNull();
  });

  it('omits the history group outside page preparation mode', () => {
    renderGroup(false);

    expect(container?.querySelector('[data-ui="content.toolbar.history-group"]')).toBeNull();
    expect(container?.querySelector('[data-ui="test.settings-menu"]')).not.toBeNull();
  });
});
