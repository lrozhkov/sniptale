// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ToolbarMenuState } from '../state/menu';
import { ToolbarSettingsMenu } from './settings';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: vi.fn() },
  runtimeInfo: {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getURL: vi.fn(),
  },
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('keeps an open settings dropdown transient instead of marking its trigger active', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const toolbarMenuState = {
    activeMenuType: 'settings',
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
  } satisfies ToolbarMenuState;

  act(() => {
    root.render(
      <ToolbarSettingsMenu
        compactMenus={false}
        displayMode="horizontal"
        pinToTab={false}
        pinToTabAvailable
        pinToTabLocked={false}
        screenshotMode
        toolbarMenuState={toolbarMenuState}
        onClose={() => undefined}
        onCompactMenusChange={() => undefined}
        onDisableScreenshotMode={() => undefined}
        onDisplayModeChange={() => undefined}
        onPinToTabChange={() => undefined}
      />
    );
  });

  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.settings-button"]'
  );
  expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  expect(trigger?.getAttribute('data-active')).toBeNull();

  act(() => root.unmount());
});
