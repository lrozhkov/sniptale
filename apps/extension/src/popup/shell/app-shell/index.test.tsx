// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const popupAppShellMocks = vi.hoisted(() => ({
  commandPaletteMock: vi.fn(),
  exportPageMock: vi.fn(),
  footerMock: vi.fn(),
  homePageMock: vi.fn(),
  popupTabsMock: vi.fn(),
  videoSetupPageMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));
vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: () => ({ homepage_url: 'https://example.test/support' }),
    getURL: (path: string) => `chrome-extension://${path}`,
  },
}));
vi.mock('../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lazy-chunks')>()),
  LazyExportPage: (props: unknown) => {
    popupAppShellMocks.exportPageMock(props);
    return <div data-testid="export-page">export</div>;
  },
  LazyPopupCommandPalette: (props: unknown) => {
    popupAppShellMocks.commandPaletteMock(props);
    return <div data-testid="command-palette">palette</div>;
  },
  LazyVideoSetupPage: (props: unknown) => {
    popupAppShellMocks.videoSetupPageMock(props);
    return <div data-testid="video-setup">setup</div>;
  },
}));
vi.mock('../footer', () => ({
  default: (props: unknown) => {
    popupAppShellMocks.footerMock(props);
    return <div data-testid="footer">footer</div>;
  },
}));
vi.mock('../home/page-shell', () => ({
  PopupHomePage: (props: unknown) => {
    popupAppShellMocks.homePageMock(props);
    return <div data-testid="home-page">home</div>;
  },
}));
vi.mock('../tabs', () => ({
  PopupTabs: (props: unknown) => {
    popupAppShellMocks.popupTabsMock(props);
    return <div data-testid="popup-tabs">tabs</div>;
  },
}));

import { PopupAppShell } from './index';
import type { PopupRuntimeState } from '../runtime/types/state';
import {
  createPopupAppShellActiveTabCapabilities,
  createPopupAppShellRuntime,
  type PopupRuntimeStateOverrides,
} from './test-support/runtime';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRuntime(overrides: PopupRuntimeStateOverrides = {}): PopupRuntimeState {
  return createPopupAppShellRuntime(overrides);
}

async function renderShell(props: {
  commandPaletteOpen?: boolean;
  onCloseCommandPalette?: () => void;
  runtime?: PopupRuntimeState;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <PopupAppShell
        runtime={props.runtime ?? createRuntime()}
        commandPaletteOpen={props.commandPaletteOpen ?? false}
        onCloseCommandPalette={props.onCloseCommandPalette ?? vi.fn()}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupAppShellMocks.commandPaletteMock.mockReset();
  popupAppShellMocks.exportPageMock.mockReset();
  popupAppShellMocks.footerMock.mockReset();
  popupAppShellMocks.homePageMock.mockReset();
  popupAppShellMocks.popupTabsMock.mockReset();
  popupAppShellMocks.videoSetupPageMock.mockReset();
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

async function verifiesHomeRouteAndPalette() {
  const onCloseCommandPalette = vi.fn();

  await renderShell({
    commandPaletteOpen: true,
    onCloseCommandPalette,
    runtime: createRuntime({
      activeTabCapabilities: createPopupAppShellActiveTabCapabilities({ isRestrictedPage: true }),
    }),
  });

  expect(container?.textContent).toContain('home');
  expect(container?.textContent).toContain('tabs');
  expect(container?.textContent).toContain('footer');
  expect(container?.textContent).toContain('palette');
  expect(popupAppShellMocks.homePageMock).toHaveBeenCalledTimes(1);
  expect(popupAppShellMocks.popupTabsMock).toHaveBeenCalledTimes(1);
  expect(popupAppShellMocks.footerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      restrictionIndicatorTitle: null,
      showRestrictionIndicator: false,
    })
  );

  const paletteProps = popupAppShellMocks.commandPaletteMock.mock.calls[0]?.[0] as {
    onClose: () => void;
  };
  paletteProps.onClose();
  expect(onCloseCommandPalette).toHaveBeenCalledTimes(1);
}

async function verifiesActiveRecordingRoute() {
  const runtime = createRuntime({ page: 'video', recordingActive: true });

  await renderShell({ runtime });

  expect(container?.textContent).toContain('setup');
  expect(container?.textContent).toContain('tabs');
  expect(popupAppShellMocks.popupTabsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      page: 'video',
    })
  );
  expect(popupAppShellMocks.videoSetupPageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      onCancel: expect.any(Function),
      onPauseResume: runtime.recording.handlePauseResume,
      onStop: runtime.recording.handleStop,
      recordingState: runtime.recording.recordingState,
    })
  );
}

async function verifiesManualNavigationWhileRecording() {
  const runtime = createRuntime({
    page: 'export',
    recordingActive: true,
    showFooter: false,
  });

  await renderShell({ runtime });

  expect(container?.textContent).toContain('export');
  expect(popupAppShellMocks.popupTabsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      page: 'export',
    })
  );
  expect(popupAppShellMocks.videoSetupPageMock).not.toHaveBeenCalled();
}

async function verifiesExportRouteWithoutFooter() {
  await renderShell({ runtime: createRuntime({ page: 'export', showFooter: false }) });

  expect(container?.textContent).toContain('export');
  expect(popupAppShellMocks.exportPageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isActive: true,
    })
  );
  expect(popupAppShellMocks.footerMock).not.toHaveBeenCalled();
}

function runPopupAppShellSuite() {
  it(
    'renders the home route, restriction-aware footer, and command palette overlay',
    verifiesHomeRouteAndPalette
  );
  it(
    'keeps tabs visible and routes active recording through the video setup page',
    verifiesActiveRecordingRoute
  );
  it(
    'keeps manual tab selection intact while recording stays active',
    verifiesManualNavigationWhileRecording
  );
  it(
    'renders the export route without the footer when the shell hides it',
    verifiesExportRouteWithoutFooter
  );
}

describe('PopupAppShell', runPopupAppShellSuite);
