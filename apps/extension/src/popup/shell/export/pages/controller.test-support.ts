import { vi } from 'vitest';
import type { PopupExportController } from '../controller';

type ControllerFixtureOverrides = {
  actions?: Partial<PopupExportController['actions']>;
  derived?: Partial<PopupExportController['state']['derived']>;
  preferences?: Partial<PopupExportController['state']['preferences']> &
    Partial<PopupExportController['state']['preferences']['actions']> &
    Partial<PopupExportController['state']['preferences']['values']>;
  session?: Partial<PopupExportController['state']['session']> &
    Partial<PopupExportController['state']['session']['actions']> &
    Partial<PopupExportController['state']['session']['copy']> &
    Partial<PopupExportController['state']['session']['refs']> &
    Partial<PopupExportController['state']['session']['transfer']>;
  tabs?: Partial<PopupExportController['state']['tabs']>;
};

function createDefaultActions(): PopupExportController['actions'] {
  return {
    handleCancelExport: vi.fn(async () => undefined),
    handleCopyJson: vi.fn(async () => undefined),
    handleCopyMarkdown: vi.fn(async () => undefined),
    handleResetExportView: vi.fn(async () => undefined),
    handleSaveWebSnapshot: vi.fn(async () => undefined),
    handleStartExport: vi.fn(async () => undefined),
  };
}

function createDefaultDerivedState(): PopupExportController['state']['derived'] {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    exportDisabledReason: null,
    isExporting: false,
    progressSteps: [],
  };
}

function createDefaultPreferencesState(): PopupExportController['state']['preferences'] {
  return {
    actions: {
      setIncludeAnnotations: vi.fn(),
      setIncludeBasicLogs: vi.fn(),
      setIncludeCssDiagnostics: vi.fn(),
      setIncludeFiles: vi.fn(),
      setIncludeFullPageScreenshot: vi.fn(),
      setIncludePageDiagnostics: vi.fn(),
      setIncludeImages: vi.fn(),
      setIncludeJson: vi.fn(),
      setIncludeMarkdown: vi.fn(),
    },
    hasLoadedPreferences: true,
    values: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
  };
}

function createDefaultSessionState(): PopupExportController['state']['session'] {
  return {
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
      cancelRetryRef: { current: null },
      copyRequestIdRef: { current: 0 },
      copyResetTimeoutRef: { current: null },
      requestIdRef: { current: null },
    },
    transfer: {
      progress: {
        activeStepKey: null,
        current: 0,
        errors: [],
        message: '',
        phase: 'idle',
        total: 0,
      },
      result: null,
    },
  };
}

function createDefaultTabsState(): PopupExportController['state']['tabs'] {
  return {
    availableTabs: [],
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 1,
    selectedTabIds: [11],
    selectedTabIdsInOrder: [11],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function applyPreferenceValueOverrides(
  state: PopupExportController['state']['preferences'],
  overrides: NonNullable<ControllerFixtureOverrides['preferences']>
) {
  if (overrides.includeAnnotations !== undefined) {
    state.values.includeAnnotations = overrides.includeAnnotations;
  }
  if (overrides.includeBasicLogs !== undefined) {
    state.values.includeBasicLogs = overrides.includeBasicLogs;
  }
  if (overrides.includeCssDiagnostics !== undefined) {
    state.values.includeCssDiagnostics = overrides.includeCssDiagnostics;
  }
  if (overrides.includeFiles !== undefined) {
    state.values.includeFiles = overrides.includeFiles;
  }
  if (overrides.includeFullPageScreenshot !== undefined) {
    state.values.includeFullPageScreenshot = overrides.includeFullPageScreenshot;
  }
  if (overrides.includePageDiagnostics !== undefined) {
    state.values.includePageDiagnostics = overrides.includePageDiagnostics;
  }
  if (overrides.includeImages !== undefined) {
    state.values.includeImages = overrides.includeImages;
  }
  if (overrides.includeJson !== undefined) {
    state.values.includeJson = overrides.includeJson;
  }
  if (overrides.includeMarkdown !== undefined) {
    state.values.includeMarkdown = overrides.includeMarkdown;
  }
}

function applyPreferenceActionOverrides(
  state: PopupExportController['state']['preferences'],
  overrides: NonNullable<ControllerFixtureOverrides['preferences']>
) {
  if (overrides.setIncludeAnnotations !== undefined) {
    state.actions.setIncludeAnnotations = overrides.setIncludeAnnotations;
  }
  if (overrides.setIncludeBasicLogs !== undefined) {
    state.actions.setIncludeBasicLogs = overrides.setIncludeBasicLogs;
  }
  if (overrides.setIncludeCssDiagnostics !== undefined) {
    state.actions.setIncludeCssDiagnostics = overrides.setIncludeCssDiagnostics;
  }
  if (overrides.setIncludeFiles !== undefined) {
    state.actions.setIncludeFiles = overrides.setIncludeFiles;
  }
  if (overrides.setIncludeFullPageScreenshot !== undefined) {
    state.actions.setIncludeFullPageScreenshot = overrides.setIncludeFullPageScreenshot;
  }
  if (overrides.setIncludePageDiagnostics !== undefined) {
    state.actions.setIncludePageDiagnostics = overrides.setIncludePageDiagnostics;
  }
  if (overrides.setIncludeImages !== undefined) {
    state.actions.setIncludeImages = overrides.setIncludeImages;
  }
  if (overrides.setIncludeJson !== undefined) {
    state.actions.setIncludeJson = overrides.setIncludeJson;
  }
  if (overrides.setIncludeMarkdown !== undefined) {
    state.actions.setIncludeMarkdown = overrides.setIncludeMarkdown;
  }
}

function createPreferencesState(
  overrides: ControllerFixtureOverrides['preferences']
): PopupExportController['state']['preferences'] {
  const defaults = createDefaultPreferencesState();
  const state: PopupExportController['state']['preferences'] = {
    actions: { ...defaults.actions, ...overrides?.actions },
    hasLoadedPreferences: overrides?.hasLoadedPreferences ?? defaults.hasLoadedPreferences,
    values: { ...defaults.values, ...overrides?.values },
  };

  if (overrides) {
    applyPreferenceValueOverrides(state, overrides);
    applyPreferenceActionOverrides(state, overrides);
  }

  return state;
}

function applySessionDataOverrides(
  state: PopupExportController['state']['session'],
  overrides: NonNullable<ControllerFixtureOverrides['session']>
) {
  if (overrides.copiedFormat !== undefined) {
    state.copy.copiedFormat = overrides.copiedFormat;
  }
  if (overrides.copyingFormat !== undefined) {
    state.copy.copyingFormat = overrides.copyingFormat;
  }
  if (overrides.copyRequestIdRef !== undefined) {
    state.refs.copyRequestIdRef = overrides.copyRequestIdRef;
  }
  if (overrides.copyResetTimeoutRef !== undefined) {
    state.refs.copyResetTimeoutRef = overrides.copyResetTimeoutRef;
  }
  if (overrides.requestIdRef !== undefined) {
    state.refs.requestIdRef = overrides.requestIdRef;
  }
  if (overrides.progress !== undefined) {
    state.transfer.progress = overrides.progress;
  }
  if (overrides.result !== undefined) {
    state.transfer.result = overrides.result;
  }
}

function applySessionActionOverrides(
  state: PopupExportController['state']['session'],
  overrides: NonNullable<ControllerFixtureOverrides['session']>
) {
  if (overrides.setCopiedFormat !== undefined) {
    state.actions.setCopiedFormat = overrides.setCopiedFormat;
  }
  if (overrides.setCopyingFormat !== undefined) {
    state.actions.setCopyingFormat = overrides.setCopyingFormat;
  }
  if (overrides.setProgress !== undefined) {
    state.actions.setProgress = overrides.setProgress;
  }
  if (overrides.setResult !== undefined) {
    state.actions.setResult = overrides.setResult;
  }
}

function createSessionState(
  overrides: ControllerFixtureOverrides['session']
): PopupExportController['state']['session'] {
  const defaults = createDefaultSessionState();
  const state: PopupExportController['state']['session'] = {
    actions: { ...defaults.actions, ...overrides?.actions },
    copy: { ...defaults.copy, ...overrides?.copy },
    refs: { ...defaults.refs, ...overrides?.refs },
    transfer: { ...defaults.transfer, ...overrides?.transfer },
  };

  if (overrides) {
    applySessionDataOverrides(state, overrides);
    applySessionActionOverrides(state, overrides);
  }

  return state;
}

export function createPopupExportControllerFixture(
  overrides: ControllerFixtureOverrides = {}
): PopupExportController {
  return {
    actions: {
      ...createDefaultActions(),
      ...overrides.actions,
    },
    state: {
      derived: { ...createDefaultDerivedState(), ...overrides.derived },
      preferences: createPreferencesState(overrides.preferences),
      session: createSessionState(overrides.session),
      tabs: { ...createDefaultTabsState(), ...overrides.tabs },
    },
  };
}
