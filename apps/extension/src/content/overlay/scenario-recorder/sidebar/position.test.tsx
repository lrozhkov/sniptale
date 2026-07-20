// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  clampScenarioRecorderSidebarPosition,
  resolveScenarioRecorderSidebarPosition,
} from './position';

let sidebarEl: HTMLDivElement | null = null;

function setElementRect(
  element: HTMLElement,
  rect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
  }
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

function createFloatingBlocker(
  selector: 'toolbar' | 'menu',
  rect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
  }
) {
  const element = document.createElement('div');
  if (selector === 'toolbar') {
    element.dataset['ui'] = 'content.toolbar.root';
  } else {
    element.setAttribute('class', 'sniptale-popover-menu');
  }
  setElementRect(element, rect);
  document.body.appendChild(element);
  return element;
}

beforeEach(() => {
  sidebarEl = document.createElement('div');
  document.body.appendChild(sidebarEl);
  Object.defineProperty(sidebarEl, 'offsetWidth', {
    configurable: true,
    get: () => 336,
  });
  Object.defineProperty(sidebarEl, 'offsetHeight', {
    configurable: true,
    get: () => 420,
  });
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  document.body.replaceChildren();
  sidebarEl = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('clamps dragged sidebar coordinates into the viewport', () => {
  expect(
    clampScenarioRecorderSidebarPosition({ x: -40, y: 9999 }, sidebarEl as HTMLDivElement)
  ).toEqual({
    x: 12,
    y: 468,
  });
});

it('keeps the recorder sidebar under the toolbar and floating menus when they overlap', () => {
  createFloatingBlocker('toolbar', {
    top: 80,
    left: 260,
    right: 620,
    bottom: 132,
    width: 360,
    height: 52,
  });
  createFloatingBlocker('menu', {
    top: 142,
    left: 280,
    right: 560,
    bottom: 286,
    width: 280,
    height: 144,
  });

  const nextPosition = resolveScenarioRecorderSidebarPosition({
    requestedPosition: { x: 300, y: 96 },
    sidebarRef: { current: sidebarEl },
  });

  expect(nextPosition).toEqual({
    x: 300,
    y: 298,
  });
});
