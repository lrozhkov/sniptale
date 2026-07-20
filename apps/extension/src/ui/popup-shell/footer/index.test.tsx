// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { PopupFooter, type PopupFooterProps } from './index';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mediaQueryMatches = false;

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: () => ({
      name: 'Sniptale',
      version: '0.0.0-test',
    }),
  },
}));

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: mediaQueryMatches,
      media: '(prefers-color-scheme: dark)',
      removeEventListener: vi.fn(),
    })),
  });
}

function setDesignSystemFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetModules();
  mediaQueryMatches = false;
  window.localStorage.clear();
  installMatchMedia();
  setDesignSystemFlag(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  setDesignSystemFlag(undefined);
});

async function renderFooter() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <PopupFooter
        onOpenDesignSystem={() => undefined}
        onOpenGithub={() => undefined}
        onOpenSettings={() => undefined}
      />
    );
  });
}

async function renderFooterWithProps(props: Partial<PopupFooterProps>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <PopupFooter
        onOpenDesignSystem={() => undefined}
        onOpenGithub={() => undefined}
        onOpenSettings={() => undefined}
        {...props}
      />
    );
  });
}

function expectThemeButtonState(expectedTheme: 'light' | 'dark') {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-preference]');

  expect(button?.getAttribute('data-resolved-theme')).toBe(expectedTheme);
}

function footerAction(dataUi: string) {
  return container?.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`);
}

function clickFooterAction(dataUi: string) {
  footerAction(dataUi)?.click();
}

it('uses the system dark theme when no preference is stored', async () => {
  mediaQueryMatches = true;
  installMatchMedia();

  await renderFooter();

  expectThemeButtonState('dark');
});

it('uses the system light theme when no preference is stored', async () => {
  mediaQueryMatches = false;
  installMatchMedia();

  await renderFooter();

  expectThemeButtonState('light');
});

it('cycles the popup footer theme preference through light, dark, and system', async () => {
  await renderFooter();

  const button = document.querySelector<HTMLButtonElement>('[data-theme-preference]');

  if (!button) {
    throw new Error('Expected theme toggle button');
  }

  expect(button.getAttribute('data-theme-preference')).toBe('system');

  await act(async () => {
    button.click();
  });
  expect(button.getAttribute('data-theme-preference')).toBe('light');

  await act(async () => {
    button.click();
  });
  expect(button.getAttribute('data-theme-preference')).toBe('dark');

  await act(async () => {
    button.click();
  });
  expect(button.getAttribute('data-theme-preference')).toBe('system');
});

it('renders only the extension version in the footer label', async () => {
  await renderFooter();

  const footer = container?.querySelector('footer');
  const versionBlock = footer?.firstElementChild;

  expect(footer?.className).toContain('rounded-[16px]');
  expect(versionBlock?.textContent).toBe(`v${runtimeInfo.getManifest().version}`);
  expect(versionBlock?.textContent).not.toContain(runtimeInfo.getManifest().name);
});

it('wires footer actions and shows the restriction indicator when requested', async () => {
  const onOpenAppliedStyles = vi.fn();
  const onOpenDesignSystem = vi.fn();
  const onOpenGithub = vi.fn();
  const onOpenSettings = vi.fn();
  const restrictionIndicatorTitle = 'Недоступно на этой странице';

  await renderFooterWithProps({
    onOpenAppliedStyles,
    onOpenDesignSystem,
    onOpenGithub,
    onOpenSettings,
    showAppliedStylesAction: true,
    showRestrictionIndicator: true,
    restrictionIndicatorTitle,
  });

  act(() => {
    clickFooterAction('popup.footer.github-button');
    clickFooterAction('popup.footer.applied-styles-button');
    clickFooterAction('popup.footer.design-system-button');
    clickFooterAction('popup.footer.settings-button');
  });

  const githubButton = footerAction('popup.footer.github-button');
  expect(onOpenGithub).toHaveBeenCalledTimes(1);
  expect(githubButton?.getAttribute('title')).toBe('GitHub');
  expect(githubButton?.querySelector('svg')?.classList.contains('lucide-github')).toBe(true);
  expect(onOpenAppliedStyles).toHaveBeenCalledTimes(1);
  expect(onOpenDesignSystem).toHaveBeenCalledTimes(1);
  expect(
    container
      ?.querySelector('[data-ui="popup.footer.applied-styles-button"]')
      ?.getAttribute('title')
  ).toBe('Показать примененные стили');
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
  expect(
    container
      ?.querySelector('[data-ui="popup.footer.restriction-indicator"]')
      ?.getAttribute('title')
  ).toBe(restrictionIndicatorTitle);
  expect(
    container?.querySelector('[data-ui="popup.footer.restriction-indicator"]')?.className
  ).toContain('var(--sniptale-color-danger)');
});

it('hides the applied styles action when no current-page rules are reported', async () => {
  await renderFooterWithProps({
    onOpenAppliedStyles: vi.fn(),
    showAppliedStylesAction: false,
  });

  expect(container?.querySelector('[data-ui="popup.footer.applied-styles-button"]')).toBeNull();
});

it('hides the design system action when the build flag disables it', async () => {
  setDesignSystemFlag(false);

  await renderFooter();

  expect(container?.querySelector('[data-ui="popup.footer.design-system-button"]')).toBeNull();
});

it('keeps the settings action as the rightmost footer button', async () => {
  await renderFooter();

  const actions = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-ui^="popup.footer."]') ?? []
  ).map((node) => node.getAttribute('data-ui'));

  expect(actions.at(-1)).toBe('popup.footer.settings-button');
  expect(
    container?.querySelector<HTMLElement>('[data-ui="popup.footer.settings-button"]')?.className
  ).toContain('border-none');
});

it('omits the restriction indicator when the title is missing', async () => {
  await renderFooterWithProps({
    showRestrictionIndicator: true,
    restrictionIndicatorTitle: null,
  });

  expect(container?.querySelector('[data-ui="popup.footer.restriction-indicator"]')).toBeNull();
});
