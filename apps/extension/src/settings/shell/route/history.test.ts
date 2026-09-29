// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSettingsRoute } from './history';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useSettingsRoute> | null = null;
let navigationBlocked = false;

function Harness() {
  latest = useSettingsRoute({ navigationBlocked });
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
  navigationBlocked = false;
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

it('tracks Interface subpages across button navigation and browser history', () => {
  history.replaceState(null, '', '/settings.html?keep=1#anchor');
  act(() => root?.render(createElement(Harness)));
  expect(latest?.route).toEqual({ section: 'interface-browser', view: 'interface' });
  expect(location.search).toBe('?keep=1');

  act(() => latest?.navigate({ section: 'interface-browser', view: 'context-menu' }));
  expect(latest?.route).toEqual({ section: 'interface-browser', view: 'context-menu' });
  expect(location.search).toContain('view=context-menu');
  expect(location.search).toContain('keep=1');
  expect(location.hash).toBe('#anchor');

  act(() => {
    history.replaceState(null, '', '/settings.html?keep=1&section=appearance#anchor');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(latest?.route).toEqual({ section: 'interface-browser', view: 'interface' });
  expect(location.search).toContain('view=interface');
  expect(location.search).toContain('keep=1');
  expect(location.hash).toBe('#anchor');

  act(() => {
    history.replaceState(
      null,
      '',
      '/settings.html?keep=1&section=interface-browser&view=invalid#anchor'
    );
    dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(latest?.route).toEqual({ section: 'interface-browser', view: 'interface' });
  expect(location.search).toContain('view=interface');
  expect(location.search).toContain('keep=1');
  expect(location.hash).toBe('#anchor');
});

it('keeps the mounted route for programmatic and browser navigation while blocked', () => {
  history.replaceState(null, '', '/settings.html?section=settings-transfer');
  act(() => root?.render(createElement(Harness)));
  navigationBlocked = true;
  act(() => root?.render(createElement(Harness)));

  act(() => latest?.navigate({ section: 'interface-browser' }));
  expect(latest?.route).toEqual({ section: 'settings-transfer' });
  expect(location.search).toContain('section=settings-transfer');

  act(() => {
    history.replaceState(null, '', '/settings.html?section=access-data');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(latest?.route).toEqual({ section: 'settings-transfer' });
  expect(location.search).toContain('section=settings-transfer');
});
