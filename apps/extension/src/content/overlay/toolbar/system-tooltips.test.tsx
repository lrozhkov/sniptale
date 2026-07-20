// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarSettingsMenu } from './capture/settings';
import type { ToolbarMenuState } from './state/menu';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: vi.fn(),
  },
  runtimeInfo: {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getURL: vi.fn(),
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

describe('toolbar system tooltips', () => {
  it('uses a native title hint for the settings trigger', () => {
    renderNode(
      <ToolbarSettingsMenu
        compactMenus={false}
        pinToTab={false}
        pinToTabLocked={false}
        screenshotMode
        displayMode="horizontal"
        toolbarMenuState={createClosedToolbarMenuState()}
        onClose={() => undefined}
        onCompactMenusChange={() => undefined}
        onDisableScreenshotMode={() => undefined}
        onDisplayModeChange={() => undefined}
        onPinToTabChange={() => undefined}
      />
    );
    const settingsButton = document.querySelector('button');

    expect(settingsButton?.getAttribute('title')).toBe('Настройки панели');
    expect(settingsButton?.getAttribute('data-tooltip')).toBeNull();
  });
});
