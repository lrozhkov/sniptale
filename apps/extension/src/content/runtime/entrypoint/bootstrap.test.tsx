// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { resolvePortalTheme } from '@sniptale/ui/theme/safe-portal';

const {
  createRootMock,
  initializeTopLevelContentRuntimeMock,
  installContentUiActivationBridgeMock,
  logTopLevelContentScriptLoadMock,
  rootUnmountMock,
  runtimeCleanupMock,
} = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  initializeTopLevelContentRuntimeMock: vi.fn(),
  installContentUiActivationBridgeMock: vi.fn(),
  logTopLevelContentScriptLoadMock: vi.fn(),
  rootUnmountMock: vi.fn(),
  runtimeCleanupMock: vi.fn(),
}));

const CONTENT_RUNTIME_MARKER_ATTRIBUTE = 'data-sniptale-content-runtime';
const CONTENT_RUNTIME_MARKER_VERSION = 'dynamic-dev';

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('../../overlay/app/view', () => ({
  App: () => null,
}));

vi.mock('../bootstrap', () => ({
  ContentRuntimeCleanup: undefined,
  initializeTopLevelContentRuntime: initializeTopLevelContentRuntimeMock,
}));

vi.mock('../ui-activation-bridge', () => ({
  installContentUiActivationBridge: installContentUiActivationBridgeMock,
}));

vi.mock('./diagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./diagnostics')>()),
  logRegionCaptureApiSupport: vi.fn(),
  logTopLevelContentScriptLoad: logTopLevelContentScriptLoadMock,
}));

let mediaQuery: ReturnType<typeof installMatchMedia>;

function installMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    dispatchChange(nextMatches: boolean) {
      mediaQuery.matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    matches,
    media: '(prefers-color-scheme: dark)',
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return mediaQuery;
}

function expectContentHostBaseStyles(host: HTMLElement | null): void {
  expect(host).toBeTruthy();
  expect(host?.getAttribute('data-theme')).toBe('light');
  expect(host?.getAttribute('style')).toContain('opacity: 1;');
  expect(host?.getAttribute('style')).toContain('transform: none;');
  expect(host?.getAttribute('style')).toContain('pointer-events: none;');
  expect(host?.getAttribute('style')).toContain('width: 0;');
  expect(host?.getAttribute('style')).toContain('height: 0;');
  expect(host?.getAttribute('style')).toContain('overflow: visible;');
  expect(host?.getAttribute('style')).not.toContain('all:');
  expect(host?.getAttribute('style')).not.toContain('color-scheme:');
  expect(host?.style.colorScheme).toBe('');
}

function expectContentShadowStyles(shadowRoot: ShadowRoot | null | undefined): void {
  expect(shadowRoot).toBeTruthy();

  const styleTag = shadowRoot?.querySelector('style');
  expect(styleTag?.textContent).toContain(':host {');
  expect(styleTag?.textContent).toContain('all: initial;');
  expect(styleTag?.textContent).toContain('position: fixed;');
}

beforeEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, '__sniptaleContentRuntimeCleanup');
  createRootMock.mockReturnValue({ render: vi.fn(), unmount: rootUnmountMock });
  initializeTopLevelContentRuntimeMock.mockReturnValue(runtimeCleanupMock);
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.body.style.colorScheme = '';
  document.head.replaceChildren();
  document.body.replaceChildren();
  window.localStorage.clear();
  mediaQuery = installMatchMedia(false);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__sniptaleContentRuntimeCleanup');
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('keeps the content host theme-owned without adding giant inline host styles', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');
  const pageStyle = document.createElement('style');
  pageStyle.textContent = 'div { opacity: 0.8; transform: scale(0.98); }';
  document.head.append(pageStyle);

  initializeTopLevelContentEntry();

  const host = document.getElementById(CONTENT_ROOT_ID);
  const shadowRoot = host?.shadowRoot;
  expect(host?.getAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE)).toBe(CONTENT_RUNTIME_MARKER_VERSION);
  expectContentHostBaseStyles(host);
  expectContentShadowStyles(shadowRoot);

  const portalProbe = document.createElement('span');
  shadowRoot?.append(portalProbe);
  expect(resolvePortalTheme(portalProbe)).toBe('light');

  mediaQuery.dispatchChange(true);
  expect(host?.getAttribute('data-theme')).toBe('dark');
  expect(host?.getAttribute('style')).not.toContain('all:');
  expect(resolvePortalTheme(portalProbe)).toBe('dark');

  expect(createRootMock).toHaveBeenCalledTimes(1);
  expect(installContentUiActivationBridgeMock).toHaveBeenCalledWith(shadowRoot);
  expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(1);
  expect(logTopLevelContentScriptLoadMock).toHaveBeenCalledTimes(1);
});

it('ignores repeated initialization when the content host already exists', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');

  initializeTopLevelContentEntry();
  initializeTopLevelContentEntry();

  expect(document.querySelectorAll(`#${CONTENT_ROOT_ID}`)).toHaveLength(1);
  expect(createRootMock).toHaveBeenCalledTimes(1);
  expect(installContentUiActivationBridgeMock).toHaveBeenCalledTimes(1);
  expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(1);
});

it('replaces an unmarked content host from an outdated runtime', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');
  const oldHost = document.createElement('div');
  oldHost.id = CONTENT_ROOT_ID;
  document.body.append(oldHost);

  initializeTopLevelContentEntry();

  const nextHost = document.getElementById(CONTENT_ROOT_ID);
  expect(nextHost).not.toBe(oldHost);
  expect(nextHost?.getAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE)).toBe(
    CONTENT_RUNTIME_MARKER_VERSION
  );
  expect(createRootMock).toHaveBeenCalledTimes(1);
  expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(1);
});

it('replaces a content host from a previous injected runtime build', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');
  initializeTopLevelContentEntry();
  const oldHost = document.getElementById(CONTENT_ROOT_ID);
  oldHost?.setAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE, 'dynamic-old-build');

  initializeTopLevelContentEntry();

  const nextHost = document.getElementById(CONTENT_ROOT_ID);
  expect(nextHost).not.toBe(oldHost);
  expect(nextHost?.getAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE)).toBe(
    CONTENT_RUNTIME_MARKER_VERSION
  );
  expect(runtimeCleanupMock).toHaveBeenCalledTimes(1);
  expect(rootUnmountMock).toHaveBeenCalledTimes(1);
  expect(createRootMock).toHaveBeenCalledTimes(2);
  expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(2);
});

it('continues reinjection when the previous runtime cleanup throws', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');
  initializeTopLevelContentEntry();
  const oldHost = document.getElementById(CONTENT_ROOT_ID);
  oldHost?.setAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE, 'dynamic-old-build');
  runtimeCleanupMock.mockImplementationOnce(() => {
    throw new Error('old cleanup failed');
  });

  expect(() => initializeTopLevelContentEntry()).not.toThrow();

  const nextHost = document.getElementById(CONTENT_ROOT_ID);
  expect(nextHost).not.toBe(oldHost);
  expect(runtimeCleanupMock).toHaveBeenCalledTimes(1);
  expect(rootUnmountMock).toHaveBeenCalledTimes(1);
  expect(createRootMock).toHaveBeenCalledTimes(2);
  expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(2);
});

it('defers initialization until document body exists', async () => {
  const { initializeTopLevelContentEntry } = await import('./bootstrap');
  const originalBody = document.body;
  document.documentElement.removeChild(originalBody);

  try {
    initializeTopLevelContentEntry();

    expect(createRootMock).not.toHaveBeenCalled();
    expect(initializeTopLevelContentRuntimeMock).not.toHaveBeenCalled();

    const nextBody = document.createElement('body');
    document.documentElement.appendChild(nextBody);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.getElementById(CONTENT_ROOT_ID)).toBeTruthy();
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(initializeTopLevelContentRuntimeMock).toHaveBeenCalledTimes(1);
  } finally {
    if (!document.body) {
      document.documentElement.appendChild(originalBody);
    }
  }
});
