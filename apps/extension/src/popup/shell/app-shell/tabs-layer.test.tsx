// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const { popupTabsMock } = vi.hoisted(() => ({
  popupTabsMock: vi.fn(),
}));

vi.mock('../tabs', () => ({
  PopupTabs: (props: unknown) => {
    popupTabsMock(props);
    return null;
  },
}));

import { TabsLayer } from './tabs-layer';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupTabsRuntime } from '../runtime/types/tabs';
import type { PopupPageAccessRuntime } from '../runtime/page-access';

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

it('forwards page access state to popup tabs', () => {
  const pageAccess = createPageAccessRuntime();
  const runtime: PopupTabsRuntime = {
    environment: {
      activeTabCapabilities: createActiveTabCapabilities(),
      pageAccess,
      galleryStatus: null,
    },
    navigation: {
      isReady: true,
      page: 'home',
      setPage: vi.fn(),
      showFooter: true,
    },
  };
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => {
    root.render(<TabsLayer runtime={runtime} />);
  });

  expect(popupTabsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccess,
    })
  );
  act(() => root.unmount());
});
