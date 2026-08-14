// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../../composition/persistence/capture-settings';
import {
  cleanupRenderedNode,
  createActiveTabCapabilities,
  renderNode,
} from './popup-home.test.helpers';

const mocks = vi.hoisted(() => ({
  handleOpenScreenshotMode: vi.fn(),
  modeSelectorProps: null as { onModeChange(mode: string): void } | null,
  pageAccessControlsSpy: vi.fn(),
  setupPanelProps: null as {
    config: typeof DEFAULT_SCREENSHOT_SETUP_STATE.tab;
    disabledReason: string | null;
    onChange(config: typeof DEFAULT_SCREENSHOT_SETUP_STATE.tab): void;
    pending: boolean;
  } | null,
  setupState: null as typeof DEFAULT_SCREENSHOT_SETUP_STATE | null,
  toolsPanelProps: null as { onOpen(mode?: 'drawing'): void } | null,
  update: vi.fn(),
}));

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('./use-screenshot-setup', () => ({
  useScreenshotSetupState: () => ({
    flush: vi.fn(),
    ready: true,
    savePending: true,
    state: mocks.setupState,
    update: mocks.update,
  }),
}));
vi.mock('./mode-selector', () => ({
  ScreenshotModeSelector: (props: { onModeChange(mode: string): void }) => {
    mocks.modeSelectorProps = props;
    return <div data-testid="mode-selector" />;
  },
}));
vi.mock('./setup-panel', () => ({
  ScreenshotSetupPanel: (props: NonNullable<typeof mocks.setupPanelProps>) => {
    mocks.setupPanelProps = props;
    return <div data-testid="setup-panel" />;
  },
}));
vi.mock('./tools-panel', () => ({
  ScreenshotToolsPanel: (props: NonNullable<typeof mocks.toolsPanelProps>) => {
    mocks.toolsPanelProps = props;
    return <div data-testid="tools-panel" />;
  },
}));
vi.mock('./page-access-controls', () => ({
  PageAccessControls: (props: unknown) => {
    mocks.pageAccessControlsSpy(props);
    return <div data-testid="page-access" />;
  },
}));
vi.mock('./sections', () => ({
  PopupHomeErrorMessage: () => <div />,
  PopupHomeQuickActions: () => <div data-testid="quick-actions" />,
}));
vi.mock('./actions', () => ({
  usePopupHomeActions: () => ({
    actionError: null,
    capturePending: false,
    handleOpenScreenshotMode: mocks.handleOpenScreenshotMode,
    handleQuickAction: vi.fn(),
    handleScreenshotCapture: vi.fn(),
  }),
}));

import { PopupHomePage } from './index';

function renderHome(pageAccess?: Parameters<typeof PopupHomePage>[0]['pageAccess']) {
  return renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      {...(pageAccess ? { pageAccess } : {})}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setupState = DEFAULT_SCREENSHOT_SETUP_STATE;
  mocks.modeSelectorProps = null;
  mocks.setupPanelProps = null;
  mocks.toolsPanelProps = null;
});

afterEach(cleanupRenderedNode);

it('persists mode changes and normalizes tab setup changes', async () => {
  mocks.setupState = { ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'tab' };
  await renderHome();

  act(() => mocks.modeSelectorProps?.onModeChange('desktop'));
  act(() =>
    mocks.setupPanelProps?.onChange({
      ...DEFAULT_SCREENSHOT_SETUP_STATE.tab,
      screenshotMode: 'full',
    })
  );

  expect(mocks.update).toHaveBeenNthCalledWith(1, { selectedMode: 'desktop' });
  expect(mocks.update).toHaveBeenNthCalledWith(2, {
    tab: expect.objectContaining({ screenshotMode: 'full' }),
  });
  expect(mocks.setupPanelProps).toMatchObject({ disabledReason: null, pending: false });
});

it('opens the selected toolbar working mode from the tools tab', async () => {
  mocks.setupState = { ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'tools' };
  await renderHome();

  act(() => mocks.toolsPanelProps?.onOpen('drawing'));

  expect(mocks.handleOpenScreenshotMode).toHaveBeenCalledWith('drawing');
});

it('keeps desktop setup independent from page access controls', async () => {
  mocks.setupState = { ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'desktop' };
  await renderHome({
    disabledReason: 'Page access required',
    error: 'Page access unavailable',
    handleRequest: vi.fn(),
    loading: false,
    pendingOperation: null,
    status: {
      allSitesGranted: false,
      currentTabActive: false,
      currentTabId: 1,
      currentTabOrigin: 'https://example.com',
      siteGranted: false,
      supported: true,
    },
  });

  expect(mocks.setupPanelProps?.config).toBe(DEFAULT_SCREENSHOT_SETUP_STATE.desktop);
  expect(mocks.setupPanelProps?.disabledReason).toBeNull();
  expect(mocks.pageAccessControlsSpy).not.toHaveBeenCalled();
});
