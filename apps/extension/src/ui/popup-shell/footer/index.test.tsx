// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopupFooter, type PopupFooterProps } from './index';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mediaQueryMatches = false;

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
        onOpenGallery={() => undefined}
        onOpenGithub={() => undefined}
        onOpenImageEditor={() => undefined}
        onOpenScenarioEditor={() => undefined}
        onOpenSettings={() => undefined}
        onOpenVideoEditor={() => undefined}
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
        onOpenGallery={() => undefined}
        onOpenGithub={() => undefined}
        onOpenImageEditor={() => undefined}
        onOpenScenarioEditor={() => undefined}
        onOpenSettings={() => undefined}
        onOpenVideoEditor={() => undefined}
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

it('replaces the version with application launchers and a separator', async () => {
  await renderFooter();

  const footer = container?.querySelector('footer');
  const applicationActions = footer?.querySelector('[data-ui="popup.footer.application-actions"]');

  expect(footer?.className).toContain('rounded-[16px]');
  expect(applicationActions?.querySelectorAll('button')).toHaveLength(4);
  expect(footer?.textContent).not.toContain('v0.0.0');
  expect(footer?.querySelector('[data-ui="popup.footer.application-separator"]')).not.toBeNull();
});

it('wires the four application launchers in product order', async () => {
  const onOpenImageEditor = vi.fn();
  const onOpenVideoEditor = vi.fn();
  const onOpenScenarioEditor = vi.fn();
  const onOpenGallery = vi.fn();
  await renderFooterWithProps({
    onOpenGallery,
    onOpenImageEditor,
    onOpenScenarioEditor,
    onOpenVideoEditor,
  });

  const buttons = [
    'popup.footer.image-editor-button',
    'popup.footer.video-editor-button',
    'popup.footer.scenario-editor-button',
    'popup.footer.gallery-button',
  ];
  act(() => buttons.forEach(clickFooterAction));

  expect(onOpenImageEditor).toHaveBeenCalledOnce();
  expect(onOpenVideoEditor).toHaveBeenCalledOnce();
  expect(onOpenScenarioEditor).toHaveBeenCalledOnce();
  expect(onOpenGallery).toHaveBeenCalledOnce();
  expect(
    Array.from(
      container?.querySelectorAll('[data-ui="popup.footer.application-actions"] button') ?? []
    ).map((button) => button.getAttribute('data-ui'))
  ).toEqual(buttons);
});

it('wires footer actions and shows the restriction indicator when requested', async () => {
  const onOpenGithub = vi.fn();
  const onOpenSettings = vi.fn();
  const restrictionIndicatorTitle = 'Недоступно на этой странице';

  await renderFooterWithProps({
    onOpenGithub,
    onOpenSettings,
    showRestrictionIndicator: true,
    restrictionIndicatorTitle,
  });

  act(() => {
    clickFooterAction('popup.footer.github-button');
    clickFooterAction('popup.footer.settings-button');
  });

  const githubButton = footerAction('popup.footer.github-button');
  expect(onOpenGithub).toHaveBeenCalledTimes(1);
  expect(githubButton?.getAttribute('title')).toBe('GitHub');
  expect(githubButton?.querySelector('svg')?.classList.contains('lucide-github')).toBe(true);
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

it('does not expose the design system action in the footer', async () => {
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
