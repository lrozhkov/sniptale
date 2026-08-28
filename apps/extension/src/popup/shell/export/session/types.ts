import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type {
  PopupExportPreferences,
  PopupPagePackageSelection,
} from '../../../../composition/persistence/popup-export-preferences';
import type { PopupExportProgressStep } from '../progress/steps';
import type { PreviewFormat } from '../selection/utils';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

export type PopupExportPreferenceValues = PopupExportPreferences;

export type PopupExportPreferenceActions = {
  setIncludeAnnotations: Dispatch<SetStateAction<boolean>>;
  setIncludeBasicLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeCssDiagnostics: Dispatch<SetStateAction<boolean>>;
  setIncludeFiles: Dispatch<SetStateAction<boolean>>;
  setIncludeFullPageScreenshot: Dispatch<SetStateAction<boolean>>;
  setIncludePageDiagnostics: Dispatch<SetStateAction<boolean>>;
  setIncludeImages: Dispatch<SetStateAction<boolean>>;
  setIncludeJson: Dispatch<SetStateAction<boolean>>;
  setIncludeMarkdown: Dispatch<SetStateAction<boolean>>;
};

type PopupExportPreferenceState = {
  actions: PopupExportPreferenceActions;
  values: PopupExportPreferenceValues;
};

export type PopupPagePackagePreferenceState = PopupExportPreferenceState & {
  includeWebCopy: boolean;
  setIncludeWebCopy: Dispatch<SetStateAction<boolean>>;
};

export type PopupExportPreferenceSetters = PopupExportPreferenceActions;

export type PopupExportToggleState = PopupPagePackagePreferenceState & {
  hasLoadedPreferences: boolean;
  save: PopupPagePackagePreferenceState;
};

export type PopupExportSessionCopyState = {
  copiedFormat: PreviewFormat | null;
  copyingFormat: PreviewFormat | null;
};

export type PopupExportSessionTransferState = {
  launchedPlan: PopupPagePackageSelection | null;
  progress: ExportProgress;
  result: PopupExportResult | null;
};

export type PopupExportSessionRefs = {
  cancelRetryRef: MutableRefObject<{
    cancellationPending?: true;
    exportRunId: string;
    owner: 'job';
    tabIds: number[];
  } | null>;
  copyResetTimeoutRef: MutableRefObject<number | null>;
  copyRequestIdRef: MutableRefObject<number>;
  terminalRequestIdRef: MutableRefObject<string | null>;
  requestIdRef: MutableRefObject<string | null>;
};

export type PopupExportSessionActions = {
  setCopyingFormat: Dispatch<SetStateAction<PreviewFormat | null>>;
  setCopiedFormat: Dispatch<SetStateAction<PreviewFormat | null>>;
  setProgress: Dispatch<SetStateAction<ExportProgress>>;
  setResult: Dispatch<SetStateAction<PopupExportResult | null>>;
  setLaunchedPlan: Dispatch<SetStateAction<PopupPagePackageSelection | null>>;
};

export type PopupExportSessionState = {
  actions: PopupExportSessionActions;
  copy: PopupExportSessionCopyState;
  refs: PopupExportSessionRefs;
  transfer: PopupExportSessionTransferState;
};

export type PopupExportSelection = PopupExportPreferences;

export type PopupExportDerivedState = {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  canExport: boolean;
  exportDisabledReason: string | null;
  isExporting: boolean;
  progressSteps: PopupExportProgressStep[];
};

export type PopupExportState = {
  derived: PopupExportDerivedState;
  preferences: PopupExportToggleState;
  session: PopupExportSessionState;
  tabs: PopupExportTabSelectionState;
};
