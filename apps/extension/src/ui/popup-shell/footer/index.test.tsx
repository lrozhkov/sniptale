// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopupFooter, type PopupFooterProps } from './index';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let mediaQueryMatches = false;
const GITHUB_ICON_PATH = [
  'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2',
  'c2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2',
  'a4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3',
  'a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1',
  'a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5',
  'c0 4.6 2.7 5.7 5.5 6c-.6.6-.6 1.2-.5 2V21',
].join('');

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
    root?.render(<PopupFooter onOpenGithub={() => undefined} onOpenSettings={() => undefined} />);
  });
}

async function renderFooterWithProps(props: Partial<PopupFooterProps>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <PopupFooter onOpenGithub={() => undefined} onOpenSettings={() => undefined} {...props} />
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

it('keeps application launchers out of the menu footer', async () => {
  await renderFooter();

  const footer = container?.querySelector('footer');

  expect(footer?.className).toContain('rounded-[16px]');
  expect(footer?.querySelector('[data-ui="popup.footer.application-actions"]')).toBeNull();
  expect(footer?.querySelector('[data-ui="popup.footer.application-separator"]')).toBeNull();
});

it('places Settings on the left and GitHub with the theme control on the right', async () => {
  await renderFooter();
  const footer = container?.querySelector('footer');
  expect(container?.querySelector('[data-ui="popup.footer.version"]')).toBeNull();
  expect(footer?.firstElementChild?.getAttribute('data-ui')).toBe('popup.footer.settings-button');
  expect(
    footer?.lastElementChild?.querySelector('[data-ui="popup.footer.github-button"]')
  ).not.toBeNull();
  expect(footer?.lastElementChild?.querySelector('[data-theme-preference]')).not.toBeNull();
  expect(footer?.lastElementChild?.lastElementChild?.hasAttribute('data-locale-preference')).toBe(
    true
  );
});

it('wires the retained GitHub and Settings actions', async () => {
  const onOpenGithub = vi.fn();
  const onOpenSettings = vi.fn();

  await renderFooterWithProps({
    onOpenGithub,
    onOpenSettings,
  });

  act(() => {
    clickFooterAction('popup.footer.github-button');
    clickFooterAction('popup.footer.settings-button');
  });

  const githubButton = footerAction('popup.footer.github-button');
  const githubIcon = githubButton?.querySelector('svg');
  expect(onOpenGithub).toHaveBeenCalledTimes(1);
  expect(githubButton?.getAttribute('title')).toBe('GitHub');
  expect(githubIcon?.getAttribute('aria-hidden')).toBe('true');
  expect(githubIcon?.classList.contains('h-3.5')).toBe(true);
  expect(githubIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(githubIcon?.querySelector('path')?.getAttribute('d')).toBe(GITHUB_ICON_PATH);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

it('does not expose the design system action in the footer', async () => {
  await renderFooter();
  expect(container?.querySelector('[data-ui="popup.footer.design-system-button"]')).toBeNull();
});

it('keeps the settings action as the leftmost footer button', async () => {
  await renderFooter();

  const actions = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-ui^="popup.footer."]') ?? []
  ).map((node) => node.getAttribute('data-ui'));

  expect(actions.at(0)).toBe('popup.footer.settings-button');
  expect(
    container?.querySelector<HTMLElement>('[data-ui="popup.footer.settings-button"]')?.className
  ).toContain('border-none');
});
