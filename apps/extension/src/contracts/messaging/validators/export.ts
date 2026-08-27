import type {
  ExportOptions,
  ExportPagePackageEntry,
  ExportProgress,
  ExportProgressStepKey,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
  PopupExportResult,
  PopupExportJobStatus,
  PopupExportJobPhase,
  PopupExportJobTab,
} from '@sniptale/runtime-contracts/export';
import { hasOptionalField, isBoolean, isNumber, isRecord, isString } from './index';

const exportProgressStepKeys = new Set<ExportProgressStepKey>([
  'annotations',
  'basicLogs',
  'cssDiagnostics',
  'files',
  'fullPageScreenshot',
  'pageDiagnostics',
  'images',
  'json',
  'markdown',
  'webSnapshotPreview',
  'webSnapshotDom',
  'webSnapshotStyles',
  'webSnapshotAssets',
  'webSnapshotWarnings',
]);

const exportProgressPhases = new Set<ExportProgress['phase']>([
  'idle',
  'scanning',
  'downloading',
  'zipping',
  'done',
  'error',
]);

const popupExportJobPhases = new Set<PopupExportJobPhase>([
  'running',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
  'interrupted',
]);

function isExportProgressStepKey(value: unknown): value is ExportProgressStepKey {
  return isString(value) && exportProgressStepKeys.has(value as ExportProgressStepKey);
}

function isExportProgressPhase(value: unknown): value is ExportProgress['phase'] {
  return isString(value) && exportProgressPhases.has(value as ExportProgress['phase']);
}

function isPopupExportJobPhase(value: unknown): value is PopupExportJobPhase {
  return isString(value) && popupExportJobPhases.has(value as PopupExportJobPhase);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

function isExportPagePackageEntry(value: unknown): value is ExportPagePackageEntry {
  if (
    !isRecord(value) ||
    !isString(value['path']) ||
    !hasOptionalField(value, 'textContent', isString) ||
    !hasOptionalField(value, 'binaryBase64', isString) ||
    !hasOptionalField(value, 'mimeType', isString)
  ) {
    return false;
  }

  const hasTextContent = isString(value['textContent']);
  const hasBinaryContent = isString(value['binaryBase64']);
  return hasTextContent !== hasBinaryContent;
}

export function isExportOptions(value: unknown): value is ExportOptions {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'includeAnnotations', isBoolean) &&
    isBoolean(value['includeJson']) &&
    isBoolean(value['includeMarkdown']) &&
    isBoolean(value['includeFiles']) &&
    isBoolean(value['includeImages']) &&
    isBoolean(value['includeBasicLogs']) &&
    isBoolean(value['includePageDiagnostics']) &&
    isBoolean(value['includeCssDiagnostics']) &&
    isBoolean(value['includeFullPageScreenshot'])
  );
}

export function isExportProgress(value: unknown): value is ExportProgress {
  return (
    isRecord(value) &&
    hasOptionalField(
      value,
      'activeStepKey',
      (entry) => entry === null || isExportProgressStepKey(entry)
    ) &&
    isExportProgressPhase(value['phase']) &&
    isString(value['message']) &&
    isNonNegativeInteger(value['current']) &&
    isNonNegativeInteger(value['total']) &&
    Array.isArray(value['errors']) &&
    value['errors'].every(isString)
  );
}

export function isPopupExportResult(value: unknown): value is PopupExportResult {
  return (
    isRecord(value) &&
    isBoolean(value['success']) &&
    hasOptionalField(value, 'filename', isString) &&
    Array.isArray(value['errors']) &&
    value['errors'].every(isString) &&
    isRecord(value['stats']) &&
    isNumber(value['stats']['sectionsCount']) &&
    isNumber(value['stats']['rowsCount']) &&
    isNumber(value['stats']['filesCount']) &&
    isNumber(value['stats']['filesFailed'])
  );
}

export function isPopupExportJobTab(value: unknown): value is PopupExportJobTab {
  return isRecord(value) && isNumber(value['tabId']) && isString(value['title']);
}

export function isPopupExportJobStatus(value: unknown): value is PopupExportJobStatus {
  return (
    isRecord(value) &&
    isString(value['jobId']) &&
    isNonNegativeInteger(value['revision']) &&
    value['revision'] > 0 &&
    isPopupExportJobPhase(value['phase']) &&
    Array.isArray(value['orderedTabs']) &&
    value['orderedTabs'].every(isPopupExportJobTab) &&
    isExportOptions(value['effectiveOptions']) &&
    isExportProgress(value['progress']) &&
    Array.isArray(value['warnings']) &&
    value['warnings'].every(isString) &&
    Array.isArray(value['originalActiveTabs']) &&
    value['originalActiveTabs'].every(
      (entry) => isRecord(entry) && isNumber(entry['windowId']) && isNumber(entry['tabId'])
    ) &&
    Array.isArray(value['activatedTabIds']) &&
    value['activatedTabIds'].every(isNumber) &&
    hasOptionalField(value, 'result', isPopupExportResult)
  );
}

export function isPopupExportPreviewResponse(value: unknown): value is PopupExportPreviewResponse {
  return (
    isRecord(value) &&
    isBoolean(value['success']) &&
    hasOptionalField(value, 'error', isString) &&
    (value['preview'] === undefined ||
      (isRecord(value['preview']) &&
        isString(value['preview']['title']) &&
        isString(value['preview']['context']) &&
        isString(value['preview']['jsonPreview']) &&
        isString(value['preview']['markdownPreview']) &&
        isNumber(value['preview']['sectionsCount']) &&
        isNumber(value['preview']['rowsCount'])))
  );
}

export function isPopupExportPackageResponse(value: unknown): value is PopupExportPackageResponse {
  return (
    isRecord(value) &&
    isBoolean(value['success']) &&
    hasOptionalField(value, 'error', isString) &&
    (value['pagePackage'] === undefined ||
      (isRecord(value['pagePackage']) &&
        isString(value['pagePackage']['archiveBaseName']) &&
        Array.isArray(value['pagePackage']['entries']) &&
        value['pagePackage']['entries'].every(isExportPagePackageEntry) &&
        Array.isArray(value['pagePackage']['errors']) &&
        value['pagePackage']['errors'].every(isString) &&
        isRecord(value['pagePackage']['stats']) &&
        isNumber(value['pagePackage']['stats']['sectionsCount']) &&
        isNumber(value['pagePackage']['stats']['rowsCount']) &&
        isNumber(value['pagePackage']['stats']['filesCount']) &&
        isNumber(value['pagePackage']['stats']['filesFailed'])))
  );
}
