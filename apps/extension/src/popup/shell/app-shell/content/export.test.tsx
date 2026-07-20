// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportPageMock: vi.fn(),
  suspendLazyPage: false,
  suspendedRoutePromise: new Promise<never>(() => undefined),
}));

vi.mock('../../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lazy-chunks')>()),
  LazyExportPage: (props: unknown) => {
    if (mocks.suspendLazyPage) {
      throw mocks.suspendedRoutePromise;
    }

    mocks.exportPageMock(props);
    return <div data-testid="export-page" />;
  },
}));

import { PopupAppContentExport } from './export';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupExportRuntime } from '../../runtime/types/export-runtime';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createActiveTabCapabilities(): ActiveTabCapabilities {
  const supported = { supported: true, reason: null };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Example',
    url: 'https://example.test/page',
    videoByMode: {
      [CaptureMode.SCREEN]: supported,
      [CaptureMode.TAB]: supported,
      [CaptureMode.TAB_CROP]: supported,
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: supported,
    },
  };
}

function createPageAccessRuntime(): PopupPageAccessRuntime {
  return {
    disabledReason: null,
    error: null,
    handleRequest: vi.fn(),
    loading: false,
    pendingOperation: null,
    status: null,
  };
}

function createRuntime(
  overrides: {
    environment?: Partial<PopupExportRuntime['environment']>;
  } = {}
): PopupExportRuntime {
  const environment = {
    activeTabCapabilities: createActiveTabCapabilities(),
    galleryStatus: null,
    ...overrides.environment,
  };

  return {
    environment,
  };
}

async function renderExportRoute(runtime = createRuntime()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupAppContentExport runtime={runtime} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  mocks.exportPageMock.mockReset();
  mocks.suspendLazyPage = false;
});

it('forwards page access runtime to the lazy export route', async () => {
  const pageAccess = createPageAccessRuntime();

  await renderExportRoute({
    ...createRuntime({ environment: { pageAccess } }),
  });

  expect(mocks.exportPageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccess,
    })
  );
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

it('renders the lazy export route when the module is ready', async () => {
  await renderExportRoute();

  expect(container?.querySelector('[data-testid="export-page"]')).not.toBeNull();
  expect(mocks.exportPageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isActive: true,
    })
  );
});

it('delays the route loading fallback for a slow lazy export route', async () => {
  mocks.suspendLazyPage = true;

  await renderExportRoute();

  expect(container?.querySelector('[data-ui="popup.app.route-loading"]')).toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(350);
  });

  expect(container?.querySelector('[data-ui="popup.app.route-loading"]')).not.toBeNull();
  expect(mocks.exportPageMock).not.toHaveBeenCalled();
});
