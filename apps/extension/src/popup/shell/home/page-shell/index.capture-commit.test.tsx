// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanupRenderedNode,
  createActiveTabCapabilities,
  renderNode,
} from './popup-home.test.helpers';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../../composition/persistence/capture-settings';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(),
  handleScreenshotCapture: vi.fn(),
  setupPanelProps: null as { onCapture(): void } | null,
}));

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('./use-screenshot-setup', () => ({
  useScreenshotSetupState: () => ({
    flush: mocks.flush,
    ready: true,
    savePending: true,
    state: { ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'desktop' },
    update: vi.fn(),
  }),
}));
vi.mock('./mode-selector', () => ({ ScreenshotModeSelector: () => <div /> }));
vi.mock('./setup-panel', () => ({
  ScreenshotSetupPanel: (props: { onCapture(): void }) => {
    mocks.setupPanelProps = props;
    return <button onClick={props.onCapture}>capture</button>;
  },
}));
vi.mock('./sections', () => ({
  PopupHomeErrorMessage: () => <div />,
  PopupHomeQuickActions: () => <div />,
}));
vi.mock('./actions', () => ({
  usePopupHomeActions: () => ({
    actionError: null,
    capturePending: false,
    handleOpenScreenshotMode: vi.fn(),
    handleQuickAction: vi.fn(),
    handleScreenshotCapture: mocks.handleScreenshotCapture,
  }),
}));

import { PopupHomePage } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setupPanelProps = null;
});
afterEach(cleanupRenderedNode);

it('waits for durable setup and captures the committed config', async () => {
  let resolveFlush: (value: typeof DEFAULT_SCREENSHOT_SETUP_STATE) => void = () => undefined;
  mocks.flush.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFlush = resolve;
      })
  );
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
    />
  );
  act(() => mocks.setupPanelProps?.onCapture());
  expect(mocks.handleScreenshotCapture).not.toHaveBeenCalled();
  await act(async () => {
    resolveFlush({ ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'desktop' });
    await Promise.resolve();
  });
  expect(mocks.handleScreenshotCapture).toHaveBeenCalledWith(
    DEFAULT_SCREENSHOT_SETUP_STATE.desktop,
    null
  );
});

it('does not capture when pending setup persistence fails', async () => {
  mocks.flush.mockRejectedValueOnce(new Error('storage failed'));
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
    />
  );
  await act(async () => {
    mocks.setupPanelProps?.onCapture();
    await Promise.resolve();
  });
  expect(mocks.handleScreenshotCapture).not.toHaveBeenCalled();
});
