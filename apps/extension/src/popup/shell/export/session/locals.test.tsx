// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

const { usePopupExportTogglesMock } = vi.hoisted(() => ({
  usePopupExportTogglesMock: vi.fn(),
}));

vi.mock('../selection/toggles', () => ({
  usePopupExportToggles: usePopupExportTogglesMock,
}));

import { usePopupExportState } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof usePopupExportState> | null = null;

function createCapabilities(reason: string | null = null): ActiveTabCapabilities {
  const supported = { supported: reason === null, reason };

  return {
    tabId: 1,
    url: 'https://example.test',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: supported,
    quickActions: supported,
    export: supported,
    videoByMode: {
      [CaptureMode.TAB]: supported,
      [CaptureMode.TAB_CROP]: supported,
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: supported,
      [CaptureMode.SCREEN]: supported,
    },
  };
}

function createToggles(overrides: Record<string, unknown> = {}) {
  return {
    actions: {
      setIncludeBasicLogs: vi.fn(),
      setIncludeCssDiagnostics: vi.fn(),
      setIncludeFiles: vi.fn(),
      setIncludeFullPageScreenshot: vi.fn(),
      setIncludeHarDomLogs: vi.fn(),
      setIncludeImages: vi.fn(),
      setIncludeJson: vi.fn(),
      setIncludeMarkdown: vi.fn(),
    },
    hasLoadedPreferences: true,
    values: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeHarDomLogs: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
    ...overrides,
  };
}

function createTabSelection(
  overrides: Partial<PopupExportTabSelectionState> = {}
): PopupExportTabSelectionState {
  return {
    availableTabs: [],
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 1,
    selectedTabIds: [1],
    selectedTabIdsInOrder: [1],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    ...overrides,
  };
}

function createBlockedActiveTabSelection() {
  return createTabSelection({
    availableTabs: [
      {
        disabledReason: 'blocked',
        favIconUrl: null,
        isCurrent: true,
        tabId: 1,
        title: 'Blocked tab',
        url: 'chrome://settings',
      },
      {
        disabledReason: null,
        favIconUrl: null,
        isCurrent: false,
        tabId: 2,
        title: 'Exportable tab',
        url: 'https://example.test',
      },
    ],
    selectedCount: 1,
    selectedTabIds: [2],
    selectedTabIdsInOrder: [2],
  });
}

function ExportStateHarness(props: {
  capabilities: ActiveTabCapabilities;
  tabSelection: PopupExportTabSelectionState;
}) {
  latestState = usePopupExportState(props.capabilities, props.tabSelection);
  return null;
}

async function renderHarness(
  capabilities: ActiveTabCapabilities,
  tabSelection = createTabSelection()
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportStateHarness capabilities={capabilities} tabSelection={tabSelection} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('usePopupExportState', () => {
  it('derives copy/export availability and progress steps from current selection', async () => {
    usePopupExportTogglesMock.mockReturnValue(createToggles());

    await renderHarness(createCapabilities());

    expect(latestState?.derived.canExport).toBe(true);
    expect(latestState?.derived.canCopyJson).toBe(true);
    expect(latestState?.derived.canCopyMarkdown).toBe(true);

    await act(async () => {
      latestState?.session.actions.setProgress({
        phase: 'downloading',
        message: 'Собираем файлы',
        current: 1,
        total: 2,
        errors: [],
        activeStepKey: 'files',
      });
    });

    expect(latestState?.derived.isExporting).toBe(true);
    expect(latestState?.derived.canExport).toBe(false);
    expect(latestState?.derived.progressSteps.some((step) => step.status === 'active')).toBe(true);
  });

  it('disables exporting when the page is blocked or there is no selected tab', async () => {
    usePopupExportTogglesMock.mockReturnValue(createToggles());

    await renderHarness(createCapabilities('blocked'), createTabSelection({ selectedCount: 0 }));

    expect(latestState?.derived.exportDisabledReason).toBe('blocked');
    expect(latestState?.derived.canExport).toBe(false);
    expect(latestState?.derived.canCopyJson).toBe(false);
    expect(latestState?.derived.canCopyMarkdown).toBe(false);
  });

  it('keeps export enabled for selected exportable pages when the active tab is blocked', async () => {
    usePopupExportTogglesMock.mockReturnValue(createToggles());

    await renderHarness(createCapabilities('blocked'), createBlockedActiveTabSelection());

    expect(latestState?.derived.exportDisabledReason).toBeNull();
    expect(latestState?.derived.canExport).toBe(true);
    expect(latestState?.derived.canCopyJson).toBe(false);
    expect(latestState?.derived.canCopyMarkdown).toBe(false);
  });
});
