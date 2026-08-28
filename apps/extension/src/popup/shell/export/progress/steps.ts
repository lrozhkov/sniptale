import { translate } from '../../../../platform/i18n/popup';
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
    | 'popup.export.includeAnnotationsLabel'
    | 'popup.export.includeJsonLabel'
    | 'popup.export.includeMarkdownLabel'
    | 'popup.export.includeFilesLabel'
    | 'popup.export.includeImagesLabel'
    | 'popup.export.includeBasicLogsLabel'
    | 'popup.export.includePageDiagnosticsLabel'
    | 'popup.export.includeCssDiagnosticsLabel'
    | 'popup.export.includeFullPageScreenshotLabel'
    | 'popup.export.packageWebCopyLabel'
    | 'popup.export.webSnapshotPreviewStep'
    | 'popup.export.webSnapshotDomStep'
    | 'popup.export.webSnapshotStylesStep'
    | 'popup.export.webSnapshotAssetsStep'
    | 'popup.export.webSnapshotWarningsStep';
};

type ExportStepSelection = {
  includeAnnotations: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includePageDiagnostics: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  includeWebCopy?: boolean;
};

export type PopupExportProgressStep = {
  key: ExportStepKey;
  label: string;
  status: ExportStepStatus;
  statusLabel: string;
};

const EXPORT_STEP_DEFINITIONS: ExportStepDefinition[] = [
  {
    key: 'fullPageScreenshot',
    labelKey: 'popup.export.includeFullPageScreenshotLabel',
  },
  { key: 'annotations', labelKey: 'popup.export.includeAnnotationsLabel' },
  { key: 'json', labelKey: 'popup.export.includeJsonLabel' },
  { key: 'markdown', labelKey: 'popup.export.includeMarkdownLabel' },
  { key: 'files', labelKey: 'popup.export.includeFilesLabel' },
  { key: 'images', labelKey: 'popup.export.includeImagesLabel' },
  { key: 'basicLogs', labelKey: 'popup.export.includeBasicLogsLabel' },
  {
    key: 'pageDiagnostics',
    labelKey: 'popup.export.includePageDiagnosticsLabel',
  },
  {
    key: 'cssDiagnostics',
    labelKey: 'popup.export.includeCssDiagnosticsLabel',
  },
];

const WEB_SNAPSHOT_STEP_DEFINITION: ExportStepDefinition = {
  key: 'webSnapshotDom',
  labelKey: 'popup.export.packageWebCopyLabel',
};
const WEB_SNAPSHOT_RUNTIME_STEP_KEYS: ExportStepKey[] = [
  'webSnapshotDom',
  'webSnapshotPreview',
  'webSnapshotStyles',
  'webSnapshotAssets',
  'webSnapshotWarnings',
];

const SCANNING_KEYS: ExportStepKey[] = ['annotations', 'json', 'markdown'];
const DOWNLOADING_KEYS: ExportStepKey[] = ['files', 'images'];
const ZIPPING_KEYS: ExportStepKey[] = [
  'basicLogs',
  'pageDiagnostics',
  'cssDiagnostics',
  'fullPageScreenshot',
];

function isStepSelected(key: ExportStepKey, selection: ExportStepSelection) {
  switch (key) {
    case 'annotations':
      return selection.includeAnnotations;
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
    case 'pageDiagnostics':
      return selection.includePageDiagnostics;
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
  if (progress.activeStepKey) {
    if (progress.activeStepKey === 'webSnapshotPreview' && selection.includeFullPageScreenshot) {
      return 'fullPageScreenshot';
    }
    return isStepSelected(progress.activeStepKey, selection) ? progress.activeStepKey : null;
  }
  if (selection.includeWebCopy) return null;

  switch (progress.phase) {
    case 'idle':
      return null;
    case 'done':
      return null;
    case 'cancelled':
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

function hasCompletedArchiveResult(result: PopupExportResult | null): boolean {
  return Boolean(result?.success || result?.filename);
}

function isWebSnapshotStepKey(key: ExportStepKey | null | undefined): boolean {
  return key !== null && key !== undefined && WEB_SNAPSHOT_RUNTIME_STEP_KEYS.includes(key);
}

function hasWebSnapshotOutcome(keys: ExportProgressStepKey[] | undefined): boolean {
  const outcomes = new Set(keys ?? []);
  return WEB_SNAPSHOT_RUNTIME_STEP_KEYS.some((key) => outcomes.has(key));
}

function isWebSnapshotCompleted(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
}): boolean {
  const completed = new Set(args.progress.completedStepKeys ?? []);
  return (
    completed.has('webSnapshotAssets') ||
    completed.has('webSnapshotWarnings') ||
    args.result?.success === true
  );
}

function resolveWebSnapshotStatus(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
}): ExportStepStatus {
  if (hasWebSnapshotOutcome(args.progress.failedStepKeys)) return 'error';
  if (isWebSnapshotCompleted(args)) return 'done';
  if (args.progress.phase === 'cancelled') return 'pending';
  if (isWebSnapshotStepKey(args.progress.activeStepKey)) return 'active';
  return args.progress.phase !== 'idle' && !args.result ? 'active' : 'pending';
}

function buildWebSnapshotProgressSteps(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
}): PopupExportProgressStep[] {
  const status = resolveWebSnapshotStatus(args);
  return [
    {
      key: WEB_SNAPSHOT_STEP_DEFINITION.key,
      label: translate(WEB_SNAPSHOT_STEP_DEFINITION.labelKey),
      status,
      statusLabel: getStepStatusLabel(status),
    },
  ];
}

export function buildPopupExportProgressSteps(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
  selection: ExportStepSelection;
}): PopupExportProgressStep[] {
  const hasWebCopy =
    args.selection.includeWebCopy ||
    args.result?.kind === 'webSnapshot' ||
    isWebSnapshotStepKey(args.progress.activeStepKey);
  const webCopySteps = hasWebCopy
    ? buildWebSnapshotProgressSteps({
        progress: args.progress,
        result: args.result,
      })
    : [];

  if (hasWebCopy && args.selection.includeWebCopy !== true) {
    return webCopySteps;
  }

  const structuredSteps = buildStructuredProgressSteps(args);
  if (!hasWebCopy) return structuredSteps;
  return [...webCopySteps, ...structuredSteps];
}

function buildStructuredProgressSteps(args: {
  progress: ExportProgress;
  result: PopupExportResult | null;
  selection: ExportStepSelection;
}): PopupExportProgressStep[] {
  const selectedDefinitions = EXPORT_STEP_DEFINITIONS.filter(({ key }) =>
    isStepSelected(key, args.selection)
  );

  if (selectedDefinitions.length === 0) {
    return [];
  }

  const activeStepKey = getActiveStepKey(args.progress, args.selection);
  const activeIndex = selectedDefinitions.findIndex(({ key }) => key === activeStepKey);
  const completedStepKeys = new Set(args.progress.completedStepKeys ?? []);
  if (completedStepKeys.has('webSnapshotPreview')) {
    completedStepKeys.add('fullPageScreenshot');
  }
  const failedStepKeys = new Set(args.progress.failedStepKeys ?? []);
  if (failedStepKeys.has('webSnapshotPreview')) {
    failedStepKeys.add('fullPageScreenshot');
  }
  const hasExplicitOutcomes =
    args.progress.completedStepKeys !== undefined || args.progress.failedStepKeys !== undefined;

  return selectedDefinitions.map(({ key, labelKey }, index) => {
    let status: ExportStepStatus = 'pending';

    if (failedStepKeys.has(key)) {
      status = 'error';
    } else if (hasCompletedArchiveResult(args.result)) {
      status = 'done';
    } else if (completedStepKeys.has(key)) {
      status = 'done';
    } else if (!hasExplicitOutcomes && activeIndex >= 0 && index < activeIndex) {
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
