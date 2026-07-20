// @vitest-environment jsdom

import { isValidElement, Suspense } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../sections/appearance', () => ({
  AppearanceSection: () => 'appearance',
}));

vi.mock('../../sections/editor', () => ({
  EditorSection: () => 'editor',
}));

vi.mock('../../sections/ai-providers', () => ({
  AIProvidersSection: () => 'ai',
}));

vi.mock('../../sections/viewport-presets', () => ({
  PresetsSection: () => 'presets',
}));

vi.mock('../../sections/save-presets', () => ({
  SavePresetsSection: () => 'saves',
}));

vi.mock('../../sections/highlighter/section', () => ({
  HighlighterSection: () => 'highlighter',
}));

vi.mock('../../sections/image', () => ({
  ImageSettingsSection: () => 'image',
}));

vi.mock('../../sections/templates', () => ({
  TemplatesSection: () => 'templates',
}));

vi.mock('../../sections/quick-actions', () => ({
  QuickActionsSection: () => 'quickactions',
}));

vi.mock('../../sections/page-styles', () => ({
  PageStylesSection: () => 'pageStyles',
}));

vi.mock('../../sections/permissions', () => ({
  PermissionsSection: () => 'permissions',
}));

vi.mock('../../sections/privacy', () => ({
  PrivacySection: () => 'privacy',
}));

import {
  preloadDeferredSettingsSections,
  renderSettingsTabContent,
  shouldDeferSettingsTab,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setRulesUiFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value,
  });
}

async function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  setRulesUiFlag(undefined);
});

describe('settings page section registry', () => {
  it('marks the editor tab as deferred and exposes a lazy render branch', () => {
    expect(shouldDeferSettingsTab('editor')).toBe(true);
    expect(shouldDeferSettingsTab('appearance')).toBe(false);
    const appearanceSection = renderSettingsTabContent('appearance');
    const editorSection = renderSettingsTabContent('editor');

    expect(isValidElement(appearanceSection)).toBe(true);
    expect(appearanceSection).toHaveProperty('type');
    expect(isValidElement(editorSection)).toBe(true);
  });

  it('preloads deferred settings tabs and resolves the editor lazy section', async () => {
    await preloadDeferredSettingsSections();

    await render(<Suspense fallback="loading">{renderSettingsTabContent('pageStyles')}</Suspense>);

    expect(container?.textContent).toBe('pageStyles');
  });

  it('preloads and resolves the privacy lazy section', async () => {
    await preloadDeferredSettingsSections();

    await render(<Suspense fallback="loading">{renderSettingsTabContent('privacy')}</Suspense>);

    expect(container?.textContent).toBe('privacy');
  });

  it('falls back from the hidden page style rules section in release-gated mode', async () => {
    vi.resetModules();
    setRulesUiFlag(false);
    const releaseSections = await import('./sections');

    expect(releaseSections.shouldDeferSettingsTab('pageStyles')).toBe(false);
    await releaseSections.preloadDeferredSettingsSections();
    await render(
      <Suspense fallback="loading">
        {releaseSections.renderSettingsTabContent('pageStyles')}
      </Suspense>
    );

    expect(container?.textContent).toBe('appearance');
  });
});
