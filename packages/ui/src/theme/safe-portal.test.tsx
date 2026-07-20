// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeThemeScopedStyle,
  resolvePortalTheme,
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from './safe-portal';

let container: HTMLDivElement | null = null;
let latestTheme: 'light' | 'dark' | null = null;
let root: Root | null = null;

function HookHarness(props: { source: Node | null }) {
  latestTheme = useResolvedPortalTheme(props.source);
  return null;
}

async function renderHarness(source: Node | null) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness source={source} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestTheme = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('theme-safe-portal pure helpers', () => {
  registerPortalTargetResolutionTests();
  registerPortalThemeStyleTests();
});

function registerPortalTargetResolutionTests() {
  it('resolves portal targets and theme owners across DOM and fallback roots', () => {
    const owner = document.createElement('section');
    owner.setAttribute('data-theme', 'dark');
    const anchor = document.createElement('div');
    owner.append(anchor);
    document.body.append(owner);

    const fragment = document.createDocumentFragment();
    const detachedAnchor = document.createElement('span');
    fragment.append(detachedAnchor);

    const host = document.createElement('div');
    host.setAttribute('data-theme', 'dark');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const shadowAnchor = document.createElement('span');
    shadowRoot.append(shadowAnchor);
    document.body.append(host);

    expect(resolveThemeSafePortalTarget(anchor)).toBe(document.body);
    expect(resolveThemeSafePortalTarget(detachedAnchor)).toBe(fragment);
    expect(resolveThemeSafePortalTarget(shadowAnchor)).toBe(shadowRoot);
    expect(resolvePortalTheme(anchor)).toBe('dark');
    expect(resolvePortalTheme(shadowAnchor)).toBe('dark');
    expect(resolvePortalTheme(host)).toBe('dark');

    document.body.setAttribute('data-theme', 'light');
    expect(resolvePortalTheme(document.createTextNode('fallback'))).toBe('light');
    expect(resolvePortalTheme(null)).toBe('light');
  });
}

function registerPortalThemeStyleTests() {
  it('returns null when the resolved theme attribute is invalid', () => {
    const owner = document.createElement('section');
    owner.setAttribute('data-theme', 'system');
    const anchor = document.createElement('div');
    owner.append(anchor);
    document.body.append(owner);

    expect(resolvePortalTheme(anchor)).toBeNull();
  });

  it('resolves dark class theme owners used by local preview surfaces', () => {
    const owner = document.createElement('section');
    owner.className = 'sniptale-theme-dark';
    const anchor = document.createElement('div');
    owner.append(anchor);
    document.body.append(owner);

    expect(resolvePortalTheme(anchor)).toBe('dark');
  });

  it('merges theme-scoped styles only when a resolved theme exists', () => {
    expect(mergeThemeScopedStyle(null, { display: 'block' })).toEqual({ display: 'block' });
    expect(mergeThemeScopedStyle('dark', { display: 'block' })).toEqual({
      colorScheme: 'dark',
      display: 'block',
    });
    expect(mergeThemeScopedStyle('light')).toEqual({ colorScheme: 'light' });
  });
}

describe('useResolvedPortalTheme', () => {
  it('hydrates from the nearest owner and reacts to theme attribute changes', async () => {
    const owner = document.createElement('section');
    owner.setAttribute('data-theme', 'light');
    const source = document.createElement('div');
    owner.append(source);
    document.body.append(owner);

    await renderHarness(source);
    expect(latestTheme).toBe('light');

    await act(async () => {
      owner.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    expect(latestTheme).toBe('dark');
  });

  it('returns null when there is no owner or observer support', async () => {
    const source = document.createElement('div');
    const originalObserver = globalThis.MutationObserver;

    vi.stubGlobal('MutationObserver', undefined);
    await renderHarness(source);
    expect(latestTheme).toBeNull();

    if (originalObserver) {
      vi.stubGlobal('MutationObserver', originalObserver);
    }
  });
});
