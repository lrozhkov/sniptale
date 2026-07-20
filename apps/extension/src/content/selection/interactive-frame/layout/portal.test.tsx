// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { getThemedPortalStyle, useContentPortalTheme, useFixedPortalContainer } from './portal';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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
  document.getElementById('sniptale-resize-handles-portal')?.remove();
  document.getElementById(CONTENT_ROOT_ID)?.remove();
});

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
  it('keeps fixed portal containers in sync with the content theme owner', async () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    host.setAttribute('data-theme', 'light');
    document.body.appendChild(host);
    renderNode(<FixedPortalHarness />);

    const portalContainer = document.getElementById('sniptale-resize-handles-portal');
    expect(portalContainer?.getAttribute('data-theme')).toBe('light');
    expect((portalContainer as HTMLDivElement).style.colorScheme).toBe('light');

    await act(async () => {
      host.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    expect(portalContainer?.getAttribute('data-theme')).toBe('dark');
    expect((portalContainer as HTMLDivElement).style.colorScheme).toBe('dark');
  });

  it('resolves the content theme for runtime portal wrappers', async () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    host.setAttribute('data-theme', 'light');
    document.body.appendChild(host);
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
