// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarMenuState, type ToolbarMenuState } from './menu';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let currentState: ToolbarMenuState | null = null;

function ToolbarMenuStateHarness() {
  currentState = useToolbarMenuState();
  return null;
}

function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ToolbarMenuStateHarness />);
  });
}

function getCurrentState(): ToolbarMenuState {
  if (!currentState) {
    throw new Error('Toolbar menu state did not render');
  }

  return currentState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  renderHarness();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentState = null;
  vi.unstubAllGlobals();
});

describe('useToolbarMenuState', () => {
  it('keeps only one toolbar popover active across capture and preparation menus', () => {
    act(() => getCurrentState().setShowCaptureMenu(true));

    expect(getCurrentState().activeMenuType).toBe('capture');
    expect(getCurrentState().showCaptureMenu).toBe(true);

    act(() => getCurrentState().toggleMenu('mode'));

    expect(getCurrentState().activeMenuType).toBe('mode');
    expect(getCurrentState().showCaptureMenu).toBe(false);
  });

  it('closes timer and viewport menus when toolbar settings opens', () => {
    act(() => getCurrentState().setShowTimerMenu(true));
    expect(getCurrentState().showTimerMenu).toBe(true);

    act(() => getCurrentState().toggleMenu('settings'));

    expect(getCurrentState().activeMenuType).toBe('settings');
    expect(getCurrentState().showTimerMenu).toBe(false);

    act(() => getCurrentState().setViewportMenuOpen(true));
    expect(getCurrentState().viewportMenuOpen).toBe(true);

    act(() => getCurrentState().toggleMenu('settings'));

    expect(getCurrentState().activeMenuType).toBe('settings');
    expect(getCurrentState().viewportMenuOpen).toBe(false);
  });

  it('keeps scenario and highlighter utility popovers in the same single-open group', () => {
    act(() => getCurrentState().toggleMenu('auto-blur'));
    expect(getCurrentState().activeMenuType).toBe('auto-blur');

    act(() => getCurrentState().toggleMenu('scenario-project'));
    expect(getCurrentState().activeMenuType).toBe('scenario-project');

    act(() => getCurrentState().toggleMenu('scenario-mode'));
    expect(getCurrentState().activeMenuType).toBe('scenario-mode');
  });
});
