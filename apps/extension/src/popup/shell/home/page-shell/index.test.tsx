// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../../composition/persistence/capture-settings';
import {
  cleanupRenderedNode,
  createActiveTabCapabilities,
  getContainer,
  renderNode,
} from './popup-home.test.helpers';

const mocks = vi.hoisted(() => ({
  handleScreenshotCapture: vi.fn(),
  usePopupHomeActions: vi.fn(),
}));

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('./actions', () => ({
  usePopupHomeActions: (args: unknown) => mocks.usePopupHomeActions(args),
}));

import { PopupHomePage } from './index';

beforeEach(() => {
  mocks.handleScreenshotCapture.mockReset();
  mocks.usePopupHomeActions.mockReturnValue({
    actionError: null,
    capturePending: false,
    handleQuickAction: vi.fn(),
    handleScreenshotCapture: mocks.handleScreenshotCapture,
  });
});

afterEach(cleanupRenderedNode);

it('renders shortcuts alongside the two screenshot setup modes', async () => {
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady={false}
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
    />
  );

  expect(getContainer()?.textContent).toContain('popup.home.captureTabLabel');
  expect(getContainer()?.textContent).toContain('popup.home.captureWindowLabel');
  expect(getContainer()?.textContent).toContain('popup.home.shortcutsModeLabel');
  expect(getContainer()?.textContent).not.toContain('popup.home.toolsLabel');
  expect(mocks.usePopupHomeActions).toHaveBeenCalledWith({
    quickActions: [],
    quickActionsDisabledReason: null,
    screenshotDisabledReason: null,
  });
});

it('uses the authoritative desktop snapshot for the first screenshot frame', async () => {
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      initialSetupState={{ ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'desktop' }}
    />
  );

  await act(async () => {
    getContainer()
      ?.querySelector<HTMLButtonElement>('button[title="popup.home.captureButtonTitle"]')
      ?.click();
    await Promise.resolve();
  });

  expect(mocks.handleScreenshotCapture).toHaveBeenCalledWith(
    DEFAULT_SCREENSHOT_SETUP_STATE.desktop,
    null
  );
});

it('shows an owner-local action error', async () => {
  mocks.usePopupHomeActions.mockReturnValue({
    actionError: 'Capture failed',
    capturePending: false,
    handleQuickAction: vi.fn(),
    handleScreenshotCapture: mocks.handleScreenshotCapture,
  });
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
    />
  );
  expect(getContainer()?.textContent).toContain('Capture failed');
});
