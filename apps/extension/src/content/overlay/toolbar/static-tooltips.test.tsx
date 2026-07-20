// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function ensureRoot() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
}

async function renderNode(node: React.ReactNode) {
  ensureRoot();
  act(() => {
    root?.render(node);
  });
}

async function renderCaptureActionToggle(_captureAction: string) {
  const { ToolbarCaptureActionToggle } = await import('./capture/toggle');

  await renderNode(
    <ToolbarCaptureActionToggle
      buttonRef={{ current: null }}
      showCaptureMenu={false}
      closeMenus={() => undefined}
      setShowCaptureMenu={() => undefined}
      getCaptureActionIcon={() => <span>icon</span>}
    />
  );
}

async function renderViewportButton(currentViewport: { width: number; height: number } | null) {
  const { ViewportSelectorButton } = await import('../viewport-selector/views');

  await renderNode(
    <ViewportSelectorButton
      currentViewport={currentViewport}
      disabled={false}
      isOpen={false}
      onToggle={() => undefined}
    />
  );
}

async function renderUtilityButtons() {
  const { ToolbarUtilityButtons } = await import('./controls/utilities');

  await renderNode(
    <ToolbarUtilityButtons
      screenshotMode={true}
      isCursorMode={false}
      highlighterMode={true}
      isLoading={false}
      framesCount={1}
      navigationLockEnabled={false}
      lockDisabled={false}
      toggleNavigationLock={() => undefined}
      onClearHighlights={() => undefined}
      toolbarMenuState={createClosedToolbarMenuState()}
      compactMenus={false}
      displayMode="horizontal"
      sidebarVisible={false}
    />
  );
}

async function renderCaptureButtons() {
  const { ToolbarCaptureButtons } = await import('./capture/options');

  await renderNode(<ToolbarCaptureButtons onTakeScreenshot={() => undefined} />);
}

function expectClearHighlightsTooltip() {
  expect(
    document.querySelector('[data-ui="content.toolbar.clear-frames-button"]')?.getAttribute('title')
  ).toBe('Очистить все рамки');
}

describe('toolbar static tooltips', () => {
  it('keeps capture-action tooltip static for active and inactive states', async () => {
    await renderCaptureActionToggle('download_default');
    const inactiveButton = document.querySelector('button');
    expect(inactiveButton?.getAttribute('title')).toBe('После захвата');
    expect(inactiveButton?.getAttribute('data-tooltip')).toBeNull();
    expect(inactiveButton?.className.includes('sniptale-capture-active')).toBe(false);
    expect(inactiveButton?.getAttribute('data-active')).toBe('true');

    await renderCaptureActionToggle('copy');
    const activeButton = document.querySelector('button');
    expect(activeButton?.getAttribute('title')).toBe('После захвата');
    expect(activeButton?.getAttribute('data-tooltip')).toBeNull();
    expect(activeButton?.className.includes('sniptale-capture-active')).toBe(false);
    expect(activeButton?.getAttribute('data-active')).toBe('true');
  }, 15000);

  it('keeps viewport tooltip static even when emulation is active', async () => {
    await renderViewportButton(null);
    expect(document.querySelector('button')?.getAttribute('title')).toBe('Эмуляция экрана');
    expect(document.querySelector('button')?.getAttribute('data-tooltip')).toBeNull();

    await renderViewportButton({ width: 1440, height: 900 });
    expect(document.querySelector('button')?.getAttribute('title')).toBe('Эмуляция экрана');
    expect(document.querySelector('button')?.getAttribute('data-tooltip')).toBeNull();
    expect(document.querySelector('button')?.getAttribute('data-active')).toBe('true');
  }, 15000);

  it('keeps clear-highlights tooltip static in annotation mode', async () => {
    await renderUtilityButtons();
    expectClearHighlightsTooltip();
  });

  it('uses native titles for the main screenshot-type buttons', async () => {
    await renderCaptureButtons();
    const buttons = Array.from(document.querySelectorAll('button'));

    expect(buttons.map((button) => button.getAttribute('title'))).toEqual([
      'Видимая область',
      'Полная страница',
      'Выделенная область',
    ]);
    expect(buttons.every((button) => button.getAttribute('data-tooltip') === null)).toBe(true);
  });
});
