// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenarioV3FloatingChrome } from './floating-chrome';
import { createFloatingProps } from './floating-chrome/test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('does not mount timeline controls for guide authoring', () => {
  act(() => root?.render(<ScenarioV3FloatingChrome {...createFloatingProps()} />));

  expect(container?.querySelector('[data-ui="scenario.floating.build-timeline"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.build-timeline"]')).toBeNull();
});
