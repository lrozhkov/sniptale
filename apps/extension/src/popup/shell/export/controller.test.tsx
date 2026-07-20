// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import type { PopupPageAccessRuntime } from '../runtime/page-access';

const popupExportControllerMocks = vi.hoisted(() => ({
  usePopupExportRuntimeMock: vi.fn(),
  usePopupExportStateMock: vi.fn(),
  usePopupExportTabSelectionMock: vi.fn(),
}));

vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  usePopupExportState: (...args: unknown[]) =>
    popupExportControllerMocks.usePopupExportStateMock(...args),
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime')>()),
  usePopupExportRuntime: (...args: unknown[]) =>
    popupExportControllerMocks.usePopupExportRuntimeMock(...args),
}));

vi.mock('./selection/tabs/state', () => ({
  usePopupExportTabSelection: (...args: unknown[]) =>
    popupExportControllerMocks.usePopupExportTabSelectionMock(...args),
}));

import { usePopupExportController } from './controller';
import { createPopupExportControllerFixture } from './pages/controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof usePopupExportController> | null = null;

function ControllerHarness(props: {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccess: PopupPageAccessRuntime;
}) {
  latestValue = usePopupExportController(props);
  return null;
}

async function renderHarness(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccess?: PopupPageAccessRuntime;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ControllerHarness
        activeTabCapabilities={args.activeTabCapabilities}
        isActive={args.isActive}
        pageAccess={args.pageAccess ?? createPageAccessRuntime()}
      />
    );
  });
}

function createActiveTabCapabilities(): ActiveTabCapabilities {
  const supported = { reason: null, supported: true };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Example',
    url: 'https://example.test/page',
    videoByMode: createVideoCapabilities(supported),
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

function createGroupedExportState() {
  return createPopupExportControllerFixture({
    derived: { canExport: true },
    session: {
      progress: {
        activeStepKey: null,
        current: 0,
        errors: [],
        message: '',
        phase: 'idle',
        total: 0,
      },
    },
  }).state;
}

function expectControllerWiring(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  actions: {
    handleCopyJson: ReturnType<typeof vi.fn>;
    handleStartExport: ReturnType<typeof vi.fn>;
  };
  state: ReturnType<typeof createGroupedExportState>;
  tabSelection: { selectedCount: number };
}) {
  expect(popupExportControllerMocks.usePopupExportTabSelectionMock).toHaveBeenCalledWith({
    activeTabCapabilities: args.activeTabCapabilities,
    isActive: true,
    pageAccessStatus: null,
  });
  expect(popupExportControllerMocks.usePopupExportStateMock).toHaveBeenCalledWith(
    args.activeTabCapabilities,
    args.tabSelection,
    null
  );
  expect(popupExportControllerMocks.usePopupExportRuntimeMock).toHaveBeenCalledWith({
    isActive: true,
    state: expect.objectContaining({
      canExport: true,
      progress: expect.objectContaining({ phase: 'idle' }),
    }),
  });
  expect(latestValue).toEqual({
    actions: args.actions,
    state: args.state,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupExportControllerMocks.usePopupExportRuntimeMock.mockReset();
  popupExportControllerMocks.usePopupExportStateMock.mockReset();
  popupExportControllerMocks.usePopupExportTabSelectionMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  vi.unstubAllGlobals();
});

it('merges popup export state with runtime actions for the current active tab session', async () => {
  const state = createGroupedExportState();
  const actions = {
    handleCopyJson: vi.fn(),
    handleStartExport: vi.fn(),
  };
  const tabSelection = {
    selectedCount: 1,
  };
  const activeTabCapabilities = createActiveTabCapabilities();
  const pageAccess = createPageAccessRuntime();

  popupExportControllerMocks.usePopupExportTabSelectionMock.mockReturnValue(tabSelection);
  popupExportControllerMocks.usePopupExportStateMock.mockReturnValue(state);
  popupExportControllerMocks.usePopupExportRuntimeMock.mockReturnValue(actions);

  await renderHarness({ activeTabCapabilities, isActive: true, pageAccess });

  expectControllerWiring({
    activeTabCapabilities,
    actions,
    state,
    tabSelection,
  });
});
