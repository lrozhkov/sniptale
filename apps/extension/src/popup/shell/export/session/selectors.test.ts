import { describe, expect, it, vi } from 'vitest';
import { getPopupExportDerivedState, getPopupExportSelection } from './selectors';
import type { PopupExportSessionState, PopupExportToggleState } from './types';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

function createToggleState(
  overrides: Partial<PopupExportToggleState> = {}
): PopupExportToggleState {
  const defaults: PopupExportToggleState = {
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
  };

  return {
    actions: { ...defaults.actions, ...overrides.actions },
    hasLoadedPreferences: overrides.hasLoadedPreferences ?? defaults.hasLoadedPreferences,
    values: { ...defaults.values, ...overrides.values, ...overrides },
  };
}

function createSessionState(
  overrides: Partial<PopupExportSessionState> = {}
): PopupExportSessionState {
  const defaults: PopupExportSessionState = {
    actions: {
      setCopiedFormat: vi.fn(),
      setCopyingFormat: vi.fn(),
      setProgress: vi.fn(),
      setResult: vi.fn(),
    },
    copy: {
      copiedFormat: null,
      copyingFormat: null,
    },
    refs: {
      copyRequestIdRef: { current: 0 },
      copyResetTimeoutRef: { current: null },
      requestIdRef: { current: null },
    },
    transfer: {
      progress: {
        current: 0,
        errors: [],
        message: '',
        phase: 'idle',
        total: 0,
        activeStepKey: null,
      },
      result: null,
    },
  };

  return {
    actions: { ...defaults.actions, ...overrides.actions },
    copy: { ...defaults.copy, ...overrides.copy },
    refs: { ...defaults.refs, ...overrides.refs },
    transfer: { ...defaults.transfer, ...overrides.transfer },
  };
}

function createTabSelectionState(
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

function createBlockedActiveTabSelectionState(): Partial<PopupExportTabSelectionState> {
  return {
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
  };
}

function createDerivationInput(
  overrides: {
    capability?: { reason: string | null; supported: boolean };
    session?: Partial<PopupExportSessionState>;
    tabSelection?: Partial<PopupExportTabSelectionState>;
    toggles?: Partial<PopupExportToggleState>;
  } = {}
) {
  return {
    activeTabCapabilities: {
      export: overrides.capability ?? { reason: null, supported: true },
    } as never,
    session: createSessionState(overrides.session),
    tabSelection: createTabSelectionState(overrides.tabSelection),
    toggles: createToggleState(overrides.toggles),
  };
}

describe('popup export state selection', () => {
  it('builds artifact selection from the toggle state', () => {
    expect(
      getPopupExportSelection(
        createToggleState({
          values: {
            ...createToggleState().values,
            includeBasicLogs: true,
            includeImages: false,
            includeMarkdown: false,
          },
        })
      )
    ).toEqual(
      expect.objectContaining({
        includeBasicLogs: true,
        includeImages: false,
        includeMarkdown: false,
      })
    );
  });
});

describe('popup export derived state', () => {
  it('derives export availability from session, toggles, and tab selection', () => {
    const derived = getPopupExportDerivedState({
      ...createDerivationInput(),
    });

    expect(derived.canExport).toBe(true);
  });

  it('derives copy availability from session, toggles, and tab selection', () => {
    const derived = getPopupExportDerivedState({
      ...createDerivationInput(),
    });

    expect(derived.canCopyJson).toBe(true);
    expect(derived.canCopyMarkdown).toBe(true);
  });

  it('keeps copy actions available when json and markdown export toggles are disabled', () => {
    const derived = getPopupExportDerivedState({
      ...createDerivationInput({
        toggles: {
          values: {
            ...createToggleState().values,
            includeJson: false,
            includeMarkdown: false,
          },
        },
      }),
    });

    expect(derived.canCopyJson).toBe(true);
    expect(derived.canCopyMarkdown).toBe(true);
  });
});

describe('popup export blocked-state derivation', () => {
  it('disables export when nothing is selected or export is blocked', () => {
    const blocked = getPopupExportDerivedState({
      ...createDerivationInput({
        capability: { reason: 'blocked', supported: false },
        tabSelection: { selectedCount: 0, selectedTabIds: [] },
      }),
    });

    expect(blocked.exportDisabledReason).toBe('blocked');
    expect(blocked.canExport).toBe(false);
    expect(blocked.canCopyJson).toBe(false);
    expect(blocked.canCopyMarkdown).toBe(false);
  });

  it('keeps batch export available for selected exportable tabs when the active tab is blocked', () => {
    const derived = getPopupExportDerivedState({
      ...createDerivationInput({
        capability: { reason: 'blocked', supported: false },
        tabSelection: createBlockedActiveTabSelectionState(),
      }),
    });

    expect(derived.exportDisabledReason).toBeNull();
    expect(derived.canExport).toBe(true);
    expect(derived.canCopyJson).toBe(false);
    expect(derived.canCopyMarkdown).toBe(false);
  });
});
