// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSettingsRoute } from './history';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useSettingsRoute> | null = null;

function Harness() {
  latest = useSettingsRoute();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('normalizes the initial legacy route with replaceState', () => {
  history.replaceState(null, '', '/settings.html?section=video&keep=1#anchor');
  const replaceSpy = vi.spyOn(history, 'replaceState');
  act(() => root?.render(createElement(Harness)));
  expect(latest?.route).toEqual({ section: 'media-quality', view: 'video' });
  expect(replaceSpy).toHaveBeenCalledOnce();
  expect(location.search).toContain('keep=1');
  expect(location.hash).toBe('#anchor');
});

it('pushes user navigation and reparses browser navigation', () => {
  history.replaceState(null, '', '/settings.html?keep=1');
  act(() => root?.render(createElement(Harness)));
  act(() => latest?.navigate({ section: 'annotations', view: 'callouts' }));
  expect(location.search).toContain('section=annotations');
  expect(location.search).toContain('view=callouts');
  expect(location.search).toContain('keep=1');

  act(() => {
    history.replaceState(null, '', '/settings.html?section=access-data&view=privacy');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(latest?.route).toEqual({ section: 'access-data', view: 'privacy' });
});
