import type {
  ExportOptions,
  ExportPagePackageEntry,
  ExportProgress,
  ExportProgressStepKey,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import { hasOptionalField, isBoolean, isNumber, isRecord, isString } from './index';

const exportProgressStepKeys = new Set<ExportProgressStepKey>([
  'basicLogs',
  'cssDiagnostics',
  'files',
  'fullPageScreenshot',
  'harDomLogs',
  'images',
  'json',
  'markdown',
]);

function isExportProgressStepKey(value: unknown): value is ExportProgressStepKey {
  return isString(value) && exportProgressStepKeys.has(value as ExportProgressStepKey);
}

function isExportPagePackageEntry(value: unknown): value is ExportPagePackageEntry {
  return (
    isRecord(value) &&
    isString(value['path']) &&
    hasOptionalField(value, 'textContent', isString) &&
    hasOptionalField(value, 'binaryBase64', isString) &&
    hasOptionalField(value, 'mimeType', isString) &&
    (isString(value['textContent']) || isString(value['binaryBase64']))
  );
}

export function isExportOptions(value: unknown): value is ExportOptions {
  return (
    isRecord(value) &&
    isBoolean(value['includeJson']) &&
    isBoolean(value['includeMarkdown']) &&
    isBoolean(value['includeFiles']) &&
    isBoolean(value['includeImages']) &&
    isBoolean(value['includeBasicLogs']) &&
    isBoolean(value['includeHarDomLogs']) &&
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
    isString(value['phase']) &&
    isString(value['message']) &&
    isNumber(value['current']) &&
    isNumber(value['total']) &&
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
