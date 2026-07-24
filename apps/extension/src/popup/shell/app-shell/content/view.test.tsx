// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportPage: vi.fn(),
  homePage: vi.fn(),
  suspendExport: false,
  suspendedRoutePromise: new Promise<never>(() => undefined),
  videoSetup: vi.fn(),
}));

vi.mock('../../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lazy-chunks')>()),
  LazyExportPage: (props: unknown) => {
    if (mocks.suspendExport) {
      throw mocks.suspendedRoutePromise;
    }

    mocks.exportPage(props);
    return <div data-testid="export-route" />;
  },
}));

vi.mock('../../home/page-shell', () => ({
  PopupHomePage: (props: unknown) => {
    mocks.homePage(props);
    return <div data-testid="home-route" />;
  },
}));

vi.mock('../video-setup', () => ({
  PopupVideoSetup: (props: unknown) => {
    mocks.videoSetup(props);
    return <div data-testid="video-setup-route" />;
  },
}));

import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import type { PopupRuntimeState } from '../../runtime/types/state';
import {
  createPopupAppShellRuntime,
  type PopupRuntimeStateOverrides,
} from '../test-support/runtime';
import { PopupAppContent } from './view';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRuntime(overrides: PopupRuntimeStateOverrides = {}): PopupRuntimeState {
  return createPopupAppShellRuntime(overrides);
}

function createPageAccessRuntime(): PopupPageAccessRuntime {
  return {
    disabledReason: 'grant access',
    error: null,
    handleRequest: vi.fn(),
    loading: false,
    pendingOperation: null,
    status: null,
  };
}

async function renderContent(runtime = createRuntime()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupAppContent runtime={runtime} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  mocks.exportPage.mockReset();
  mocks.homePage.mockReset();
  mocks.suspendExport = false;
  mocks.videoSetup.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('renders the selected video route even when recording remains active', async () => {
  const runtime = createRuntime({ recordingActive: true, page: 'video' });

  await renderContent(runtime);

  expect(container?.querySelector('[data-testid="video-setup-route"]')).not.toBeNull();
  expect(mocks.videoSetup).toHaveBeenCalledWith(expect.objectContaining({ runtime }));
  expect(mocks.exportPage).not.toHaveBeenCalled();
  expect(mocks.homePage).not.toHaveBeenCalled();
});

it('respects manual navigation away from video while recording is active', async () => {
  await renderContent(createRuntime({ recordingActive: true, page: 'export' }));

  expect(container?.querySelector('[data-testid="export-route"]')).not.toBeNull();
  expect(mocks.exportPage).toHaveBeenCalledTimes(1);
  expect(mocks.videoSetup).not.toHaveBeenCalled();
});

it('renders the video setup route when the video page is active', async () => {
  await renderContent(createRuntime({ page: 'video' }));

  expect(container?.querySelector('[data-testid="video-setup-route"]')).not.toBeNull();
  expect(mocks.videoSetup).toHaveBeenCalledTimes(1);
});

it('projects home readiness and page access into the home owner', async () => {
  const pageAccess = createPageAccessRuntime();

  await renderContent(createRuntime({ pageAccess, quickActionsReady: false }));

  expect(container?.querySelector('[data-testid="home-route"]')).not.toBeNull();
  expect(mocks.homePage).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccess,
      quickActions: [],
      quickActionsReady: false,
    })
  );
});

it('projects page access into the ready lazy export route', async () => {
  const pageAccess = createPageAccessRuntime();

  await renderContent(createRuntime({ page: 'export', pageAccess }));

  expect(container?.querySelector('[data-testid="export-route"]')).not.toBeNull();
  expect(mocks.exportPage).toHaveBeenCalledWith(
    expect.objectContaining({
      isActive: true,
      pageAccess,
    })
  );
});

it('delays the route loading fallback for a slow lazy export route', async () => {
  mocks.suspendExport = true;

  await renderContent(createRuntime({ page: 'export' }));

  expect(container?.querySelector('[data-ui="popup.app.route-loading"]')).toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(350);
  });

  expect(container?.querySelector('[data-ui="popup.app.route-loading"]')).not.toBeNull();
  expect(mocks.exportPage).not.toHaveBeenCalled();
});
