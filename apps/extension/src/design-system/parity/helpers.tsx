import { act, useState } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect } from 'vitest';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { DesignSystemFloatingPreviewFrame } from '../previews/support/provider';
import { GlassSelect, type GlassSelectOption } from '../../ui/glass-select';
import {
  HIGH_RISK_FLOATING_PREVIEW_KEYS,
  THEME_SCOPED_PREVIEW_CASES,
  renderPreviewHarness,
  renderThemeSurface,
} from './fixtures';

export function ThemeSwitchHarness(props: { setPreviewTheme: (theme: 'light' | 'dark') => void }) {
  return (
    <>
      <button
        type="button"
        data-ui="theme-switch.light"
        onClick={() => props.setPreviewTheme('light')}
      >
        light
      </button>
      <button
        type="button"
        data-ui="theme-switch.dark"
        onClick={() => props.setPreviewTheme('dark')}
      >
        dark
      </button>
      <DesignSystemFloatingPreviewFrame minHeight={120}>
        <div data-ui="theme-harness.preview">preview</div>
      </DesignSystemFloatingPreviewFrame>
    </>
  );
}

export function PortalThemeHarness(props: { setPreviewTheme: (theme: 'light' | 'dark') => void }) {
  const options: GlassSelectOption[] = [
    { value: 'screen', label: 'Screen' },
    { value: 'window', label: 'Window' },
  ];

  return (
    <>
      <button
        type="button"
        data-ui="theme-switch.light"
        onClick={() => props.setPreviewTheme('light')}
      >
        light
      </button>
      <button
        type="button"
        data-ui="theme-switch.dark"
        onClick={() => props.setPreviewTheme('dark')}
      >
        dark
      </button>
      <GlassSelect
        value="screen"
        onChange={() => undefined}
        options={options}
        portal
        aria-label="Portal theme select"
      />
    </>
  );
}

export function ThemePopoverHarness(props: { setPreviewTheme: (theme: 'light' | 'dark') => void }) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        type="button"
        data-ui="theme-switch.light"
        onClick={() => props.setPreviewTheme('light')}
      >
        light
      </button>
      <button
        type="button"
        data-ui="theme-switch.dark"
        onClick={() => props.setPreviewTheme('dark')}
      >
        dark
      </button>
      <button type="button" ref={setAnchorEl} data-ui="content-popover.anchor">
        anchor
      </button>
      <ContentPopoverAdapter isOpen anchorEl={anchorEl}>
        <div data-ui="content-popover.body">body</div>
      </ContentPopoverAdapter>
    </>
  );
}

export async function assertThemeSwitch(renderNode: ReactNode) {
  const rendered = renderThemeSurface(renderNode);
  const mountedContainer = rendered.container;
  const themeSurface = mountedContainer.querySelector<HTMLElement>(
    '[data-ui="design-system.theme-surface"]'
  );
  const previewFrame = mountedContainer.querySelector<HTMLElement>(
    '[data-ui="design-system.preview-frame"]'
  );
  const lightButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.light"]'
  );
  const darkButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.dark"]'
  );

  expect(themeSurface).not.toBeNull();
  expect(previewFrame).not.toBeNull();
  expect(themeSurface?.contains(previewFrame)).toBe(true);

  act(() => {
    lightButton?.click();
  });

  expect(themeSurface?.getAttribute('data-theme')).toBe('light');
  expect(themeSurface?.style.colorScheme).toBe('light');

  act(() => {
    darkButton?.click();
  });

  expect(themeSurface?.getAttribute('data-theme')).toBe('dark');
  expect(themeSurface?.style.colorScheme).toBe('dark');

  return rendered;
}

export async function assertPortalSurfaceTheme(renderNode: ReactNode) {
  const rendered = renderThemeSurface(renderNode);
  const mountedContainer = rendered.container;
  const lightButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.light"]'
  );
  const darkButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.dark"]'
  );
  const trigger = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.glass-select"] button'
  );

  await act(async () => {
    lightButton?.click();
    await Promise.resolve();
  });

  await act(async () => {
    trigger?.click();
    await Promise.resolve();
  });

  const portalSurface = document.body.querySelector<HTMLElement>(
    '[data-ui="shared.ui.glass-select.portal-surface"]'
  );

  expect(portalSurface).not.toBeNull();
  expect(portalSurface?.getAttribute('data-theme')).toBe('light');
  expect(portalSurface?.style.colorScheme).toBe('light');

  await act(async () => {
    darkButton?.click();
    await Promise.resolve();
  });

  expect(portalSurface?.getAttribute('data-theme')).toBe('dark');
  expect(portalSurface?.style.colorScheme).toBe('dark');

  return rendered;
}

export async function assertContentPopoverTheme(renderNode: ReactNode) {
  const rendered = renderThemeSurface(renderNode);
  const mountedContainer = rendered.container;
  const lightButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.light"]'
  );
  const darkButton = mountedContainer.querySelector<HTMLButtonElement>(
    '[data-ui="theme-switch.dark"]'
  );

  await act(async () => {
    lightButton?.click();
    await Promise.resolve();
  });

  const popoverSurface = document.body.querySelector<HTMLElement>(
    '[data-ui="shared.ui.content-popover"]'
  );
  expect(popoverSurface).not.toBeNull();
  expect(popoverSurface?.getAttribute('data-theme')).toBe('light');
  expect(popoverSurface?.style.colorScheme).toBe('light');

  await act(async () => {
    darkButton?.click();
    await Promise.resolve();
  });

  expect(popoverSurface?.getAttribute('data-theme')).toBe('dark');
  expect(popoverSurface?.style.colorScheme).toBe('dark');

  return rendered;
}

export async function assertHighRiskPreviewsStayFramed() {
  const { buildDesignSystemVariantPreviewMap } = await import('../previews');
  const previewMap = buildDesignSystemVariantPreviewMap('ru');

  for (const previewKey of HIGH_RISK_FLOATING_PREVIEW_KEYS) {
    const preview = previewMap.get(previewKey);
    expect(preview, `${previewKey} should exist`).toBeDefined();

    const markup = renderToStaticMarkup(<>{preview}</>);
    expect(markup, `${previewKey} should render through the preview frame`).toContain(
      'data-ui="design-system.preview-frame"'
    );
  }
}

export async function assertThemeScopedPreviewCases(
  setCleanup: (cleanup: (() => void) | null) => void
) {
  for (const { previewKey, selector } of THEME_SCOPED_PREVIEW_CASES) {
    const rendered = await renderPreviewHarness(previewKey);
    setCleanup(rendered.cleanup);

    const mountedContainer = rendered.container;
    const themeSurface = mountedContainer.querySelector<HTMLElement>(
      '[data-ui="design-system.theme-surface"]'
    );
    const previewFrame = mountedContainer.querySelector<HTMLElement>(
      '[data-ui="design-system.preview-frame"]'
    );
    const previewNode = mountedContainer.querySelector<HTMLElement>(selector);
    const lightButton = mountedContainer.querySelector<HTMLButtonElement>(
      '[data-ui="theme-switch.light"]'
    );
    const darkButton = mountedContainer.querySelector<HTMLButtonElement>(
      '[data-ui="theme-switch.dark"]'
    );

    expect(themeSurface, `${previewKey} should render within the theme surface`).not.toBeNull();
    expect(previewFrame, `${previewKey} should render within the preview frame`).not.toBeNull();
    expect(previewNode, `${previewKey} should render ${selector}`).not.toBeNull();
    expect(previewFrame?.contains(previewNode)).toBe(true);
    expect(themeSurface?.contains(previewFrame)).toBe(true);

    await act(async () => {
      lightButton?.click();
      await Promise.resolve();
    });

    expect(themeSurface?.getAttribute('data-theme')).toBe('light');
    expect(themeSurface?.style.colorScheme).toBe('light');
    expect(previewNode?.isConnected).toBe(true);
    expect(previewFrame?.contains(previewNode)).toBe(true);

    await act(async () => {
      darkButton?.click();
      await Promise.resolve();
    });

    expect(themeSurface?.getAttribute('data-theme')).toBe('dark');
    expect(themeSurface?.style.colorScheme).toBe('dark');
    expect(previewNode?.isConnected).toBe(true);
    expect(previewFrame?.contains(previewNode)).toBe(true);
  }
}
