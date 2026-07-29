// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  useContentPortalTheme,
  useFixedPortalContainer,
} from './portal';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let contentHost: HTMLDivElement | null = null;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  contentHost?.remove();
  contentHost = null;
  document.body.replaceChildren();
  document.body.removeAttribute('data-theme');
});

function mountContentRoot(theme: 'light' | 'dark' = 'light') {
  contentHost = document.createElement('div');
  contentHost.id = CONTENT_ROOT_ID;
  contentHost.setAttribute('data-theme', theme);
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  const roots = initializeContentUiRoots(shadowRoot);
  return { host: contentHost, shadowRoot, ...roots };
}

function renderNode(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function FixedPortalHarness() {
  useFixedPortalContainer('sniptale-resize-handles-portal', 'position: fixed; top: 0; left: 0;');
  return null;
}

function PortalThemeProbe() {
  const theme = useContentPortalTheme();
  return (
    <div
      data-ui="content.portal.theme-probe"
      data-theme={theme ?? undefined}
      style={getThemedPortalStyle(theme, { position: 'fixed' })}
    />
  );
}

describe('interactive-frame portal utils', () => {
  it('fails closed to a detached mount after the registered host retires', () => {
    const { host } = mountContentRoot();
    host.remove();
    document.body.append(host);
    document.body.setAttribute('data-theme', 'dark');

    const target = resolveContentPortalTarget();
    renderNode(<PortalThemeProbe />);
    const probe = document.querySelector<HTMLElement>('[data-ui="content.portal.theme-probe"]');

    expect(target).toBeInstanceOf(HTMLElement);
    expect((target as HTMLElement).isConnected).toBe(false);
    expect(target).not.toBe(document.body);
    expect(probe?.hasAttribute('data-theme')).toBe(false);
    expect(probe?.style.colorScheme).toBe('');
  });

  it('keeps fixed portal containers in sync with the content theme owner', async () => {
    const pageLookalike = document.createElement('div');
    pageLookalike.id = CONTENT_ROOT_ID;
    pageLookalike.setAttribute('data-theme', 'dark');
    document.body.append(pageLookalike);
    const { host, shadowRoot } = mountContentRoot();
    renderNode(<FixedPortalHarness />);

    const portalContainer = shadowRoot.getElementById('sniptale-resize-handles-portal');
    expect(portalContainer?.getAttribute('data-theme')).toBe('light');
    expect((portalContainer as HTMLDivElement).style.colorScheme).toBe('light');
    expect(pageLookalike.querySelector('#sniptale-resize-handles-portal')).toBeNull();

    await act(async () => {
      host.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    expect(portalContainer?.getAttribute('data-theme')).toBe('dark');
    expect((portalContainer as HTMLDivElement).style.colorScheme).toBe('dark');
  });

  it('resolves the content theme for runtime portal wrappers', async () => {
    const { host } = mountContentRoot();
    renderNode(<PortalThemeProbe />);

    const probe = document.querySelector<HTMLElement>('[data-ui="content.portal.theme-probe"]');
    expect(probe?.getAttribute('data-theme')).toBe('light');
    expect(probe?.style.colorScheme).toBe('light');

    await act(async () => {
      host.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    expect(probe?.getAttribute('data-theme')).toBe('dark');
    expect(probe?.style.colorScheme).toBe('dark');
  });
});
