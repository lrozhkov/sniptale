import { translate } from '../../../../platform/i18n';
import type {
  ExportProgress,
  ExportProgressStepKey,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';

type ExportStepKey = ExportProgressStepKey;

type ExportStepStatus = 'pending' | 'active' | 'done' | 'error';

type ExportStepDefinition = {
  key: ExportStepKey;
  labelKey:
    | 'popup.export.includeJsonLabel'
    | 'popup.export.includeMarkdownLabel'
    | 'popup.export.includeFilesLabel'
    | 'popup.export.includeImagesLabel'
    | 'popup.export.includeBasicLogsLabel'
    | 'popup.export.includeHarDomLogsLabel'
    | 'popup.export.includeCssDiagnosticsLabel'
    | 'popup.export.includeFullPageScreenshotLabel'
    | 'popup.export.webSnapshotPreviewStep'
    | 'popup.export.webSnapshotDomStep'
    | 'popup.export.webSnapshotStylesStep'
    | 'popup.export.webSnapshotAssetsStep'
    | 'popup.export.webSnapshotWarningsStep';
};

type ExportStepSelection = {
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeHarDomLogs: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
};

export type PopupExportProgressStep = {
  key: ExportStepKey;
  label: string;
  status: ExportStepStatus;
  statusLabel: string;
};

const EXPORT_STEP_DEFINITIONS: ExportStepDefinition[] = [
  { key: 'json', labelKey: 'popup.export.includeJsonLabel' },
  { key: 'markdown', labelKey: 'popup.export.includeMarkdownLabel' },
  { key: 'files', labelKey: 'popup.export.includeFilesLabel' },
  { key: 'images', labelKey: 'popup.export.includeImagesLabel' },
  { key: 'basicLogs', labelKey: 'popup.export.includeBasicLogsLabel' },
  { key: 'harDomLogs', labelKey: 'popup.export.includeHarDomLogsLabel' },
  { key: 'cssDiagnostics', labelKey: 'popup.export.includeCssDiagnosticsLabel' },
  { key: 'fullPageScreenshot', labelKey: 'popup.export.includeFullPageScreenshotLabel' },
];

const WEB_SNAPSHOT_STEP_DEFINITIONS: ExportStepDefinition[] = [
  { key: 'webSnapshotPreview', labelKey: 'popup.export.webSnapshotPreviewStep' },
  { key: 'webSnapshotDom', labelKey: 'popup.export.webSnapshotDomStep' },
  { key: 'webSnapshotStyles', labelKey: 'popup.export.webSnapshotStylesStep' },
  { key: 'webSnapshotAssets', labelKey: 'popup.export.webSnapshotAssetsStep' },
];

const WEB_SNAPSHOT_WARNING_STEP_DEFINITION: ExportStepDefinition = {
  key: 'webSnapshotWarnings',
  labelKey: 'popup.export.webSnapshotWarningsStep',
};

const SCANNING_KEYS: ExportStepKey[] = ['json', 'markdown'];
const DOWNLOADING_KEYS: ExportStepKey[] = ['files', 'images'];
const ZIPPING_KEYS: ExportStepKey[] = [
  'basicLogs',
  'harDomLogs',
  'cssDiagnostics',
  'fullPageScreenshot',
];

function isStepSelected(key: ExportStepKey, selection: ExportStepSelection) {
  switch (key) {
    case 'json':
      return selection.includeJson;
    case 'markdown':
      return selection.includeMarkdown;
    case 'files':
      return selection.includeFiles;
    case 'images':
      return selection.includeImages;
    case 'basicLogs':
      return selection.includeBasicLogs;
    case 'harDomLogs':
      return selection.includeHarDomLogs;
    case 'cssDiagnostics':
      return selection.includeCssDiagnostics;
    case 'fullPageScreenshot':
      return selection.includeFullPageScreenshot;
    case 'webSnapshotPreview':
    case 'webSnapshotDom':
    case 'webSnapshotStyles':
    case 'webSnapshotAssets':
    case 'webSnapshotWarnings':
      return false;
  }
}

function getFirstSelectedKey(keys: ExportStepKey[], selection: ExportStepSelection) {
  return keys.find((key) => isStepSelected(key, selection));
}

function getActiveStepKey(
  progress: ExportProgress,
  selection: ExportStepSelection
): ExportStepKey | null {
  if (progress.activeStepKey && isStepSelected(progress.activeStepKey, selection)) {
    return progress.activeStepKey;
  }

  switch (progress.phase) {
    case 'idle':
      return null;
    case 'done':
      return null;
    case 'error':
      return null;
    case 'downloading':
      return (
        getFirstSelectedKey(DOWNLOADING_KEYS, selection) ??
        getFirstSelectedKey(ZIPPING_KEYS, selection) ??
        getFirstSelectedKey(SCANNING_KEYS, selection) ??
        null
      );
    case 'zipping':
      return (
        getFirstSelectedKey(ZIPPING_KEYS, selection) ??
        getFirstSelectedKey(DOWNLOADING_KEYS, selection) ??
        getFirstSelectedKey(SCANNING_KEYS, selection) ??
        null
      );
    case 'scanning':
      return (
        getFirstSelectedKey(SCANNING_KEYS, selection) ??
        getFirstSelectedKey(DOWNLOADING_KEYS, selection) ??
        getFirstSelectedKey(ZIPPING_KEYS, selection) ??
        null
      );
  }
}

function getStepStatusLabel(status: ExportStepStatus) {
  switch (status) {
    case 'pending':
      return translate('popup.export.stepPending');
    case 'active':
      return translate('popup.export.stepInProgress');
    case 'done':
      return translate('popup.export.stepDone');
    case 'error':
      return translate('popup.export.stepError');
  }
}

function getCompletedStepKeys(progress: ExportProgress): ExportStepKey[] {
  switch (progress.phase) {
    case 'downloading':
      return SCANNING_KEYS;
    case 'zipping':
      return [...SCANNING_KEYS, ...DOWNLOADING_KEYS];
    case 'idle':
    case 'scanning':
    case 'done':
    case 'error':
      return [];
  }
}

function hasTerminalExportError(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
}) {
  return args.progress.phase === 'error' && args.result?.filename === undefined;
}

function hasCompletedArchiveResult(result: PopupExportResult | null): boolean {
  return Boolean(result?.success || result?.filename);
}

function buildWebSnapshotProgressSteps(result: PopupExportResult): PopupExportProgressStep[] {
  const definitions =
    result.warnings && result.warnings.length > 0
      ? [...WEB_SNAPSHOT_STEP_DEFINITIONS, WEB_SNAPSHOT_WARNING_STEP_DEFINITION]
      : WEB_SNAPSHOT_STEP_DEFINITIONS;
  const status: ExportStepStatus = result.success ? 'done' : 'error';

  return definitions.map(({ key, labelKey }) => ({
    key,
    label: translate(labelKey),
    status,
    statusLabel: getStepStatusLabel(status),
  }));
}

export function buildPopupExportProgressSteps(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
  selection: ExportStepSelection;
}): PopupExportProgressStep[] {
  if (args.result?.kind === 'webSnapshot') {
    return buildWebSnapshotProgressSteps(args.result);
  }

  const selectedDefinitions = EXPORT_STEP_DEFINITIONS.filter(({ key }) =>
    isStepSelected(key, args.selection)
  );

  if (selectedDefinitions.length === 0) {
    return [];
  }

  const completedStepKeys = new Set(getCompletedStepKeys(args.progress));
  const activeStepKey = getActiveStepKey(args.progress, args.selection);

  return selectedDefinitions.map(({ key, labelKey }) => {
    let status: ExportStepStatus = 'pending';

    if (hasTerminalExportError(args)) {
      status = 'error';
    } else if (hasCompletedArchiveResult(args.result)) {
      status = 'done';
    } else if (completedStepKeys.has(key)) {
      status = 'done';
    } else if (key === activeStepKey) {
      status = 'active';
    }

    return {
      key,
      label: translate(labelKey),
      status,
      statusLabel: getStepStatusLabel(status),
    };
  });
}
