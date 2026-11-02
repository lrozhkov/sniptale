// @vitest-environment jsdom
import { isValidElement, Suspense } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../sections/general/interface-browser', () => ({
  AppearanceSection: ({ view }: { view?: string }) => `appearance:${view}`,
}));
vi.mock('../../sections/styles/editor-resources', () => ({
  EditorResourcesSection: () => 'editor',
}));
vi.mock('../../sections/system/access-data', () => ({
  AccessDataSection: ({ view }: { view?: string }) => `access:${view}`,
}));

import {
  preloadDeferredSettingsSections,
  renderSettingsRouteContent,
  renderSettingsRouteHeader,
  shouldDeferSettingsTab,
} from './sections';
import { SETTINGS_NAV_ITEMS } from '../navigation/registry';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
async function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('settings page section registry', () => {
  it('keeps only the initial interface surface eager', () => {
    expect(shouldDeferSettingsTab('editor-resources')).toBe(true);
    expect(shouldDeferSettingsTab('interface-browser')).toBe(false);
    expect(
      isValidElement(renderSettingsRouteContent({ section: 'interface-browser' }, vi.fn()))
    ).toBe(true);
  });
  it('passes the selected Interface view and navigation callback to its owner', () => {
    const onViewChange = vi.fn();
    const element = renderSettingsRouteContent(
      { section: 'interface-browser', view: 'context-menu' },
      onViewChange
    );
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) return;
    expect(element.props).toMatchObject({
      view: 'context-menu',
      onViewChange,
    });
  });
  it('renders exactly one shell-owned compact header for every canonical section', async () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      await render(renderSettingsRouteHeader(item.id));
      expect(container?.querySelectorAll('h1')).toHaveLength(1);
      expect(container?.querySelector('h1')?.textContent).not.toBe('');
      expect(container?.querySelector('header p')?.textContent).not.toBe('');
      act(() => root?.unmount());
      root = null;
      container?.remove();
      container = null;
    }
  });
  it.each(['privacy', 'secret-protection'] as const)(
    'resolves the %s view through the AccessData composition owner',
    async (view) => {
      await render(
        <Suspense fallback="loading">
          {renderSettingsRouteContent({ section: 'access-data', view }, vi.fn())}
        </Suspense>
      );
      expect(container?.textContent).toBe(`access:${view}`);
    }
  );
  it('preloads every deferred owner once and reuses the completed preload', async () => {
    const firstPreload = preloadDeferredSettingsSections();
    const secondPreload = preloadDeferredSettingsSections();
    expect(secondPreload).toBe(firstPreload);
    await expect(firstPreload).resolves.toBeUndefined();
    expect(preloadDeferredSettingsSections()).toBe(firstPreload);
  }, 15_000);
});

it('passes queue-only filter state and its route callback to the Saving boundary', () => {
  const onQueueFilterChange = vi.fn();
  const element = renderSettingsRouteContent(
    { section: 'saving', view: 'queue', queueFilter: 'action-required' },
    vi.fn(),
    onQueueFilterChange
  );
  expect(isValidElement(element)).toBe(true);
  if (!isValidElement(element)) return;
  expect(element.props).toMatchObject({
    view: 'queue',
    queueFilter: 'action-required',
    onQueueFilterChange,
  });
  const connection = renderSettingsRouteContent(
    { section: 'saving', view: 'connection' },
    vi.fn(),
    onQueueFilterChange
  );
  if (!isValidElement(connection)) throw new Error('Missing section element.');
  expect(connection.props).not.toHaveProperty('queueFilter');
  expect(connection.props).not.toHaveProperty('onQueueFilterChange');
});
