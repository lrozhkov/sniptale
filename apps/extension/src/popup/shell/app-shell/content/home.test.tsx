// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { popupHomePageMock } = vi.hoisted(() => ({
  popupHomePageMock: vi.fn(),
}));

vi.mock('../../home/page-shell', () => ({
  PopupHomePage: (props: unknown) => {
    popupHomePageMock(props);
    return <div data-testid="popup-home-page" />;
  },
}));

import { PopupAppContentHome } from './home';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupHomeRuntime } from '../../runtime/types/home-runtime';
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
    disabledReason: 'grant access',
    error: null,
    handleRequest: vi.fn(),
    loading: false,
    pendingOperation: null,
    status: null,
  };
}

function createRuntime(
  overrides: {
    environment?: Partial<PopupHomeRuntime['environment']>;
    home?: Partial<PopupHomeRuntime['home']>;
  } = {}
): PopupHomeRuntime {
  return {
    environment: {
      activeTabCapabilities: createActiveTabCapabilities(),
      galleryStatus: { pressure: 'healthy', text: 'Gallery synced' },
      ...overrides.environment,
    },
    home: {
      displayMode: 'list',
      homeError: null,
      quickActions: [],
      quickActionsReady: false,
      viewportPresets: [],
      ...overrides.home,
    },
  };
}

async function renderHome(runtime: PopupHomeRuntime = createRuntime()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupAppContentHome runtime={runtime} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupHomePageMock.mockReset();
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

it('forwards the quick-actions readiness state to the popup home page owner', async () => {
  await renderHome(createRuntime({ home: { quickActionsReady: false } }));

  expect(popupHomePageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      quickActions: [],
      quickActionsReady: false,
    })
  );
});

it('forwards page access runtime to the popup home page owner', async () => {
  const pageAccess = createPageAccessRuntime();

  await renderHome(createRuntime({ environment: { pageAccess } }));

  expect(popupHomePageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccess,
    })
  );
});
