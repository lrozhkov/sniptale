// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertContentPopoverTheme,
  assertHighRiskPreviewsStayFramed,
  assertPortalSurfaceTheme,
  assertThemeScopedPreviewCases,
  assertThemeSwitch,
  PortalThemeHarness,
  ThemePopoverHarness,
  ThemeSwitchHarness,
} from './helpers';
import { renderDesignSystemPageMarkup } from './runtime';

let container: HTMLDivElement | null = null;
let cleanupPreviewHarness: (() => void) | null = null;

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  const runtimeInfo = {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getPlatformInfo: vi.fn(),
    getURL: vi.fn(),
  };

  return {
    ...actual,
    browserRuntime: {
      ...runtimeInfo,
      subscribeToConnections: vi.fn(),
      subscribeToMessages: vi.fn(),
    },
    runtimeInfo,
  };
});

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanupPreviewHarness?.();
  cleanupPreviewHarness = null;
  container?.remove();
  container = null;
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.body.removeAttribute('data-theme');
  document.body.style.colorScheme = '';
});

describe('design-system parity fixtures', () => {
  it('renders the page inside a design-system-owned theme surface', async () => {
    const markup = await renderDesignSystemPageMarkup();
    expectDesignSystemPageMarkup(markup);
  }, 30000);

  it('keeps high-risk floating previews inside the shared preview frame', async () => {
    await assertHighRiskPreviewsStayFramed();
  }, 10000);
});

describe('design-system theme ownership surfaces', () => {
  it('keeps preview theme ownership local when switching between light and dark modes', async () => {
    const { DesignSystemThemeSurface, useDesignSystemThemeSurface } = await import('../theme');

    function Harness() {
      const { setPreviewTheme } = useDesignSystemThemeSurface();
      return <ThemeSwitchHarness setPreviewTheme={setPreviewTheme} />;
    }

    const rendered = await assertThemeSwitch(
      <DesignSystemThemeSurface>
        <Harness />
      </DesignSystemThemeSurface>
    );
    cleanupPreviewHarness = rendered.cleanup;
  }, 10000);

  it('propagates the local theme onto portaled glass-select surfaces', async () => {
    const { DesignSystemThemeSurface, useDesignSystemThemeSurface } = await import('../theme');

    function Harness() {
      const { setPreviewTheme } = useDesignSystemThemeSurface();
      return <PortalThemeHarness setPreviewTheme={setPreviewTheme} />;
    }

    const rendered = await assertPortalSurfaceTheme(
      <DesignSystemThemeSurface>
        <Harness />
      </DesignSystemThemeSurface>
    );
    cleanupPreviewHarness = rendered.cleanup;
  }, 10000);
});

describe('design-system propagated theme surfaces', () => {
  it('propagates the local theme onto content-popover adapter surfaces', async () => {
    const { DesignSystemThemeSurface, useDesignSystemThemeSurface } = await import('../theme');

    function Harness() {
      const { setPreviewTheme } = useDesignSystemThemeSurface();
      return <ThemePopoverHarness setPreviewTheme={setPreviewTheme} />;
    }

    const rendered = await assertContentPopoverTheme(
      <DesignSystemThemeSurface>
        <Harness />
      </DesignSystemThemeSurface>
    );
    cleanupPreviewHarness = rendered.cleanup;
  }, 10000);

  it('keeps product preview families theme-scoped when switching light and dark modes', async () => {
    await assertThemeScopedPreviewCases((cleanup) => {
      cleanupPreviewHarness = cleanup;
    });
  }, 10000);
});

function expectDesignSystemPageMarkup(markup: string) {
  expect(markup).toContain('data-ui="design-system.theme-surface"');
  expect(markup).toContain('data-ui="design-system.page.root"');
}
