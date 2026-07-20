// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const popupAppMocks = vi.hoisted(() => ({
  initializePopupTracerMock: vi.fn(),
  popupAppShellMock: vi.fn(),
  preloadPopupDeferredViewsMock: vi.fn(),
  usePopupCommandPaletteHotkeyMock: vi.fn(),
  usePopupRuntimeMock: vi.fn(),
}));

vi.mock('../runtime', () => ({
  PopupCommandPaletteRuntime: {},
  PopupExportRuntime: {},
  PopupHomeRuntime: {},
  PopupRuntimeNavigationControls: {},
  PopupTabsRuntime: {},
  PopupVideoSetupRuntime: {},
  usePopupRuntime: popupAppMocks.usePopupRuntimeMock,
}));

vi.mock('../command-palette/hotkey', () => ({
  usePopupCommandPaletteHotkey: popupAppMocks.usePopupCommandPaletteHotkeyMock,
}));

vi.mock('../lazy-chunks', () => ({
  LazyExportPage: () => null,
  LazyPopupCommandPalette: () => null,
  LazyVideoActivePage: () => null,
  LazyVideoSetupPage: () => null,
  preloadPopupDeferredViews: popupAppMocks.preloadPopupDeferredViewsMock,
}));

vi.mock('../../diagnostics/tracing', () => ({
  initializePopupTracer: popupAppMocks.initializePopupTracerMock,
}));

vi.mock('../app-shell', () => ({
  PopupAppShell: (props: unknown) => {
    popupAppMocks.popupAppShellMock(props);
    return <div data-testid="popup-app-shell" />;
  },
}));

vi.mock('../tabs', () => ({
  PopupTabs: () => null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

describe('PopupApp', () => {
  beforeEach(resetPopupAppTest);

  afterEach(cleanupPopupAppTest);

  it('renders the popup root with the shared extension font contract', verifyPopupRootRendering);
});

function resetPopupAppTest(): void {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  popupAppMocks.usePopupRuntimeMock.mockReturnValue({ page: 'home' });
}

function cleanupPopupAppTest(): void {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
}

async function verifyPopupRootRendering(): Promise<void> {
  const { PopupApp } = await import('./index');

  render(<PopupApp />);
  expectPopupRootShell();
  expectPopupShellProps();

  act(() => {
    vi.advanceTimersByTime(150);
  });

  expect(popupAppMocks.initializePopupTracerMock).toHaveBeenCalledTimes(1);
  expect(popupAppMocks.preloadPopupDeferredViewsMock).toHaveBeenCalledTimes(1);
}

function expectPopupRootShell(): void {
  const pageRoot = container?.querySelector('[data-ui="popup.app.root"]');

  expect(pageRoot?.className).toContain('sniptale-extension-surface');
  expect(pageRoot?.className).toContain('sc-popup-shell');
  expect(container?.querySelector('[data-testid="popup-app-shell"]')).not.toBeNull();
}

function expectPopupShellProps(): void {
  expect(popupAppMocks.popupAppShellMock).toHaveBeenCalledWith(
    expect.objectContaining({
      commandPaletteOpen: false,
      runtime: { page: 'home' },
    })
  );
  expect(popupAppMocks.usePopupCommandPaletteHotkeyMock).toHaveBeenCalledWith(
    expect.objectContaining({ isOpen: false })
  );
}
