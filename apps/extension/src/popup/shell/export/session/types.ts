import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { PopupExportPreferences } from '../../../../composition/persistence/popup-export-preferences';
import type { PopupExportProgressStep } from '../progress/steps';
import type { PreviewFormat } from '../selection/utils';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

export type PopupExportPreferenceValues = PopupExportPreferences;

export type PopupExportPreferenceActions = {
  setIncludeBasicLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeCssDiagnostics: Dispatch<SetStateAction<boolean>>;
  setIncludeFiles: Dispatch<SetStateAction<boolean>>;
  setIncludeFullPageScreenshot: Dispatch<SetStateAction<boolean>>;
  setIncludeHarDomLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeImages: Dispatch<SetStateAction<boolean>>;
  setIncludeJson: Dispatch<SetStateAction<boolean>>;
  setIncludeMarkdown: Dispatch<SetStateAction<boolean>>;
};

export type PopupExportPreferenceState = {
  actions: PopupExportPreferenceActions;
  values: PopupExportPreferenceValues;
};

export type PopupExportPreferenceSetters = PopupExportPreferenceActions;

export type PopupExportToggleState = PopupExportPreferenceState & {
  hasLoadedPreferences: boolean;
};

export type PopupExportSessionCopyState = {
  copiedFormat: PreviewFormat | null;
  copyingFormat: PreviewFormat | null;
};

export type PopupExportSessionTransferState = {
  progress: ExportProgress;
  result: PopupExportResult | null;
};

export type PopupExportSessionRefs = {
  copyResetTimeoutRef: MutableRefObject<number | null>;
  copyRequestIdRef: MutableRefObject<number>;
  requestIdRef: MutableRefObject<string | null>;
};

export type PopupExportSessionActions = {
  setCopyingFormat: Dispatch<SetStateAction<PreviewFormat | null>>;
  setCopiedFormat: Dispatch<SetStateAction<PreviewFormat | null>>;
  setProgress: Dispatch<SetStateAction<ExportProgress>>;
  setResult: Dispatch<SetStateAction<PopupExportResult | null>>;
};

export type PopupExportSessionState = {
  actions: PopupExportSessionActions;
  copy: PopupExportSessionCopyState;
  refs: PopupExportSessionRefs;
  transfer: PopupExportSessionTransferState;
};

export type PopupExportSelection = {
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeHarDomLogs: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
};

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
