// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('region-selector-ui config metrics', () => {
  it('converts a device-pixel region into css overlay metrics', async () => {
    vi.stubGlobal('window', {
      ...window,
      devicePixelRatio: 2,
    });

    const { getRecordingOverlayMetrics } = await import('./config');

    expect(
      getRecordingOverlayMetrics({
        x: 200,
        y: 120,
        width: 640,
        height: 480,
      })
    ).toEqual({
      cssHeight: 240,
      cssWidth: 320,
      cssX: 100,
      cssY: 60,
      indicatorTop: 30,
    });
  });

  it('keeps the selector root isolated above the content runtime', async () => {
    const { getRegionSelectorRootStyle, getRecordingOverlayRootStyle } = await import('./config');

    expect(getRegionSelectorRootStyle()).toContain('isolation: isolate;');
    expect(getRegionSelectorRootStyle()).toContain('z-index: 2147483646;');
    expect(getRecordingOverlayRootStyle()).toContain('z-index: 2147483645;');
  });
});

describe('region-selector-ui config theme', () => {
  it('applies the owning portal theme to the region-selector container', async () => {
    const themeOwner = document.createElement('div');
    themeOwner.id = CONTENT_ROOT_ID;
    themeOwner.setAttribute('data-theme', 'dark');
    document.body.appendChild(themeOwner);

    const container = document.createElement('div');
    const { applyRegionSelectorTheme } = await import('./config');

    applyRegionSelectorTheme(container);

    expect(container.getAttribute('data-theme')).toBe('dark');
    expect(container.style.colorScheme).toBe('dark');
  });

  it('removes stale theme attributes when no owning portal theme is available', async () => {
    const container = document.createElement('div');
    container.setAttribute('data-theme', 'dark');
    container.style.colorScheme = 'dark';
    const { applyRegionSelectorTheme } = await import('./config');

    applyRegionSelectorTheme(container);

    expect(container.hasAttribute('data-theme')).toBe(false);
    expect(container.style.colorScheme).toBe('');
  });
});
