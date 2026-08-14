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
      pendingPage: null,
      navigateToPage: vi.fn(async () => 'committed' as const),
      preloadPage: vi.fn(async () => undefined),
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
  const tabProps = popupTabsMock.mock.calls[0]?.[0] as {
    onChange: (page: 'video') => void;
    onPreload: (page: 'export') => void;
  };
  tabProps.onPreload('export');
  tabProps.onChange('video');
  expect(runtime.navigation.preloadPage).toHaveBeenCalledWith('export');
  expect(runtime.navigation.navigateToPage).toHaveBeenCalledWith('video', 'tab');
  act(() => root.unmount());
});
