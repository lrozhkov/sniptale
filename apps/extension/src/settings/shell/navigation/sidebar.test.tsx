// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) =>
    (
      ({
        'settings.navigation.sidebarEyebrow': 'Настройки',
        'settings.navigation.footerBrand': 'Sniptale',
      }) as Record<string, string>
    )[key] ?? key,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: () => ({
      version: '0.0.0-test',
    }),
  },
}));

import { SETTINGS_NAV_ITEMS } from '.';
import { SettingsSidebar } from './sidebar';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSidebar(
  activeTab: (typeof SETTINGS_NAV_ITEMS)[number]['id'],
  onTabChange = vi.fn()
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<SettingsSidebar activeTab={activeTab} onTabChange={onTabChange} />);
  });

  return onTabChange;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('SettingsSidebar', () => {
  it('renders the sidebar chrome, translated labels, and active marker state', () => {
    renderSidebar('appearance');

    expect(container?.querySelector('[data-ui="settings.sidebar.header"]')?.textContent).toBe(
      'Настройки'
    );
    expect(container?.querySelector('[data-ui="settings.sidebar.header"] h1')).toBeNull();
    expect(container?.querySelector('[data-ui="settings.sidebar.footer"]')?.textContent).toContain(
      'Sniptale v0.0.0-test'
    );
    expect(container?.querySelectorAll('button')).toHaveLength(SETTINGS_NAV_ITEMS.length);
    expect(container?.querySelector('[data-ui="settings.sidebar.nav-list"]')?.className).toContain(
      'overflow-y-auto'
    );
    expect(container?.querySelector('[data-ui="settings.sidebar.nav-list"]')?.className).toContain(
      '[scrollbar-gutter:stable]'
    );

    const activeButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('settings.navigation.appearance')
    );

    expect(activeButton?.className).toContain(
      'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_20%,var(--sniptale-color-border-soft)_80%)]'
    );
    expect(activeButton?.querySelector('div')).toBeTruthy();
  });

  it('routes item clicks through the provided tab change handler', () => {
    const onTabChange = renderSidebar('appearance');
    const templatesButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('settings.navigation.templates')
    );

    expect(templatesButton).toBeTruthy();

    act(() => {
      templatesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onTabChange).toHaveBeenCalledWith('templates');
  });
});
