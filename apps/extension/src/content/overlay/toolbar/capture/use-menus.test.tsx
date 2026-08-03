// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useToolbarMenuState, type ToolbarMenuState } from '../state/menu';
import { useToolbarCaptureMenus } from './use-menus';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentState: ToolbarMenuState | null = null;
let currentCaptureMenus: ReturnType<typeof useToolbarCaptureMenus> | null = null;

function ToolbarCaptureMenusHarness() {
  const state = useToolbarMenuState();
  currentState = state;
  currentCaptureMenus = useToolbarCaptureMenus(state);
  return null;
}

function getCurrentState(): ToolbarMenuState {
  if (!currentState) throw new Error('Toolbar menu state did not render');
  return currentState;
}

function getCurrentCaptureMenus(): ReturnType<typeof useToolbarCaptureMenus> {
  if (!currentCaptureMenus) throw new Error('Toolbar capture menus did not render');
  return currentCaptureMenus;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ToolbarCaptureMenusHarness />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  currentState = null;
  currentCaptureMenus = null;
  vi.unstubAllGlobals();
});

it('does not let a stale capture-menu dismissal close newly opened toolbar settings', () => {
  act(() => getCurrentState().setShowCaptureMenu(true));
  const staleCloseCaptureMenus = getCurrentCaptureMenus().closeMenus;

  act(() => getCurrentState().toggleMenu('settings'));
  expect(getCurrentState().activeMenuType).toBe('settings');

  act(() => staleCloseCaptureMenus(null));
  expect(getCurrentState().activeMenuType).toBe('settings');
});

it('still closes the active capture menu through the capture dismissal owner', () => {
  act(() => getCurrentState().setShowCaptureMenu(true));
  expect(getCurrentState().activeMenuType).toBe('capture');

  act(() => getCurrentCaptureMenus().closeMenus(null));
  expect(getCurrentState().activeMenuType).toBeNull();
});
