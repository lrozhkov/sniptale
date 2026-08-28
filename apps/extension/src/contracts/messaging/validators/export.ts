import type {
  ExportOptions,
  ExportProgress,
  ExportProgressStepKey,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  MAX_POPUP_EXPORT_STATUS_TEXT_BYTES,
  MAX_POPUP_EXPORT_TAB_TITLE_BYTES,
  MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES,
  isCanonicalPopupExportJobId,
} from '@sniptale/runtime-contracts/export';
import {
  MAX_PAGE_COLLECTION_PAGES,
  MAX_PAGE_PACKAGE_ID_BYTES,
  MAX_PAGE_PACKAGE_TITLE_BYTES,
  MAX_PAGE_PACKAGE_TOTAL_BYTES,
  PAGE_PACKAGE_COMPONENT_IDS,
  type PagePackageJobPhaseV1,
  type PagePackageJobStatusV1,
  type PagePackageJobTab,
} from '@sniptale/runtime-contracts/page-package';
import { estimateUtf8Bytes } from '@sniptale/runtime-contracts/validation/base64';
import { hasOptionalField, isBoolean, isNumber, isRecord, isString } from './index';

const MAX_POPUP_PACKAGE_ERROR_BYTES = 4 * 1024;
const MAX_POPUP_PACKAGE_IDENTIFIER_BYTES = 512;
const MAX_POPUP_PACKAGE_MANIFEST_BYTES = 1024 * 1024;

function isUtf8BoundedString(
  value: unknown,
  maxBytes: number,
  allowEmpty = false
): value is string {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.length > 0) &&
    estimateUtf8Bytes(value, maxBytes) <= maxBytes
  );
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
}

function isBoundedStatusTextArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_POPUP_EXPORT_JOB_TABS &&
    value.every((entry) => isUtf8BoundedString(entry, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES, true))
  );
}

function isExportStats(value: unknown): value is PopupExportResult['stats'] {
  return (
    hasExactKeys(value, ['sectionsCount', 'rowsCount', 'filesCount', 'filesFailed']) &&
    Object.values(value).every(isNonNegativeInteger)
  );
}

function isNfcUtf8BoundedString(value: unknown, maxBytes: number): value is string {
  return isUtf8BoundedString(value, maxBytes, true) && value.normalize('NFC') === value;
}

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

const popupExportJobPhases = new Set<PagePackageJobPhaseV1>([
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

function isPopupExportJobPhase(value: unknown): value is PagePackageJobPhaseV1 {
  return isString(value) && popupExportJobPhases.has(value as PagePackageJobPhaseV1);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

export function isExportOptions(value: unknown): value is ExportOptions {
  return (
    hasExactKeys(
      value,
      [
        'includeJson',
        'includeMarkdown',
        'includeFiles',
        'includeImages',
        'includeBasicLogs',
        'includePageDiagnostics',
        'includeCssDiagnostics',
        'includeFullPageScreenshot',
      ],
      ['includeAnnotations']
    ) &&
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
    hasExactKeys(value, ['phase', 'message', 'current', 'total', 'errors'], ['activeStepKey']) &&
    hasOptionalField(
      value,
      'activeStepKey',
      (entry) => entry === null || isExportProgressStepKey(entry)
    ) &&
    isExportProgressPhase(value['phase']) &&
    isUtf8BoundedString(value['message'], MAX_POPUP_EXPORT_STATUS_TEXT_BYTES, true) &&
    isNonNegativeInteger(value['current']) &&
    isNonNegativeInteger(value['total']) &&
    isBoundedStatusTextArray(value['errors'])
  );
}

export function isPopupExportResult(value: unknown): value is PopupExportResult {
  return (
    hasExactKeys(
      value,
      ['success', 'errors', 'stats'],
      ['filename', 'kind', 'snapshotBatchSize', 'snapshotIds', 'warnings']
    ) &&
    isBoolean(value['success']) &&
    hasOptionalField(value, 'filename', (entry) =>
      isUtf8BoundedString(entry, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES, true)
    ) &&
    isBoundedStatusTextArray(value['errors']) &&
    isExportStats(value['stats']) &&
    (value['kind'] === undefined ||
      value['kind'] === 'archive' ||
      value['kind'] === 'webSnapshot') &&
    (value['snapshotBatchSize'] === undefined ||
      isNonNegativeInteger(value['snapshotBatchSize'])) &&
    (value['snapshotIds'] === undefined ||
      (Array.isArray(value['snapshotIds']) &&
        value['snapshotIds'].length <= MAX_POPUP_EXPORT_JOB_TABS &&
        value['snapshotIds'].every((entry) =>
          isUtf8BoundedString(entry, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES)
        ))) &&
    (value['warnings'] === undefined || isPopupExportJobWarnings(value['warnings']))
  );
}

export function isPagePackageJobTab(value: unknown): value is PagePackageJobTab {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    isNonNegativeInteger(value['tabId']) &&
    isUtf8BoundedString(value['title'], MAX_POPUP_EXPORT_TAB_TITLE_BYTES, true)
  );
}

export function isPopupExportJobId(value: unknown): value is string {
  return isCanonicalPopupExportJobId(value);
}

export function isPagePackageJobTabs(value: unknown): value is PagePackageJobTab[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_POPUP_EXPORT_JOB_TABS ||
    !value.every(isPagePackageJobTab)
  ) {
    return false;
  }
  return new Set(value.map((tab) => tab.tabId)).size === value.length;
}

export function isPopupExportJobWarnings(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_POPUP_EXPORT_JOB_TABS) return false;
  let totalBytes = 0;
  for (const warning of value) {
    if (!isUtf8BoundedString(warning, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES, true)) return false;
    totalBytes += estimateUtf8Bytes(warning, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES);
    if (totalBytes > MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES) return false;
  }
  return true;
}

function isPagePackageEffectiveComponentPlan(value: unknown): boolean {
  if (
    !hasExactKeys(value, ['components', 'diagnosticsLevel', 'includeScreenshot']) ||
    !hasExactKeys(value['components'], [...PAGE_PACKAGE_COMPONENT_IDS])
  ) {
    return false;
  }
  const components = value['components'];
  return (
    PAGE_PACKAGE_COMPONENT_IDS.every((component) => isBoolean(components[component])) &&
    (value['diagnosticsLevel'] === 'none' ||
      value['diagnosticsLevel'] === 'standard' ||
      value['diagnosticsLevel'] === 'extended') &&
    isBoolean(value['includeScreenshot'])
  );
}

function isPagePackagePageOutcomes(value: unknown, tabs: unknown): boolean {
  if (!Array.isArray(value) || !isPagePackageJobTabs(tabs) || value.length !== tabs.length) {
    return false;
  }
  return value.every(
    (outcome, ordinal) =>
      hasExactKeys(outcome, ['ordinal', 'status', 'tabId'], ['error']) &&
      outcome['ordinal'] === ordinal &&
      outcome['tabId'] === tabs[ordinal]?.tabId &&
      (outcome['status'] === 'failed' ||
        outcome['status'] === 'pending' ||
        outcome['status'] === 'succeeded') &&
      (outcome['error'] === undefined ||
        isUtf8BoundedString(outcome['error'], MAX_POPUP_EXPORT_STATUS_TEXT_BYTES))
  );
}

export function isPagePackageJobStatus(value: unknown): value is PagePackageJobStatusV1 {
  return (
    hasExactKeys(
      value,
      [
        'jobId',
        'revision',
        'phase',
        'orderedTabs',
        'effectiveOptions',
        'effectiveComponentPlan',
        'intent',
        'pageOutcomes',
        'progress',
        'warnings',
        'originalActiveTabs',
        'activatedTabIds',
      ],
      ['result']
    ) &&
    isPopupExportJobId(value['jobId']) &&
    isNonNegativeInteger(value['revision']) &&
    value['revision'] > 0 &&
    isPopupExportJobPhase(value['phase']) &&
    (value['intent'] === 'save' || value['intent'] === 'export') &&
    isPagePackageJobTabs(value['orderedTabs']) &&
    isExportOptions(value['effectiveOptions']) &&
    isPagePackageEffectiveComponentPlan(value['effectiveComponentPlan']) &&
    isPagePackagePageOutcomes(value['pageOutcomes'], value['orderedTabs']) &&
    isExportProgress(value['progress']) &&
    isPopupExportJobWarnings(value['warnings']) &&
    Array.isArray(value['originalActiveTabs']) &&
    value['originalActiveTabs'].length <= MAX_POPUP_EXPORT_JOB_TABS &&
    value['originalActiveTabs'].every(
      (entry) =>
        hasExactKeys(entry, ['windowId', 'tabId']) &&
        isNonNegativeInteger(entry['windowId']) &&
        isNonNegativeInteger(entry['tabId'])
    ) &&
    Array.isArray(value['activatedTabIds']) &&
    value['activatedTabIds'].length <= MAX_POPUP_EXPORT_JOB_TABS &&
    value['activatedTabIds'].every(isNonNegativeInteger) &&
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
  const staged = isRecord(value) ? value['stagedPagePackage'] : undefined;
  const error = isRecord(value) ? value['error'] : undefined;
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ['error', 'stagedPagePackage', 'success'].includes(key)) &&
    isBoolean(value['success']) &&
    (error === undefined || isUtf8BoundedString(error, MAX_POPUP_PACKAGE_ERROR_BYTES)) &&
    ((value['success'] === false && staged === undefined) ||
      (value['success'] === true &&
        error === undefined &&
        isRecord(staged) &&
        Object.keys(staged).every((key) =>
          [
            'jobId',
            'manifestSha256',
            'manifestSize',
            'ordinal',
            'pageId',
            'producerStats',
            'snapshotSessionId',
            'stagedBlobId',
            'title',
            'totalBytes',
          ].includes(key)
        ) &&
        isPopupExportJobId(staged['jobId']) &&
        isString(staged['manifestSha256']) &&
        /^[a-f0-9]{64}$/.test(staged['manifestSha256']) &&
        isNonNegativeInteger(staged['manifestSize']) &&
        staged['manifestSize'] > 0 &&
        staged['manifestSize'] <= MAX_POPUP_PACKAGE_MANIFEST_BYTES &&
        isNonNegativeInteger(staged['ordinal']) &&
        staged['ordinal'] < MAX_PAGE_COLLECTION_PAGES &&
        isUtf8BoundedString(staged['pageId'], MAX_PAGE_PACKAGE_ID_BYTES) &&
        isExportStats(staged['producerStats']) &&
        hasOptionalField(staged, 'snapshotSessionId', isPopupExportJobId) &&
        isUtf8BoundedString(staged['stagedBlobId'], MAX_POPUP_PACKAGE_IDENTIFIER_BYTES) &&
        (staged['title'] === null ||
          isNfcUtf8BoundedString(staged['title'], MAX_PAGE_PACKAGE_TITLE_BYTES)) &&
        isNonNegativeInteger(staged['totalBytes']) &&
        staged['totalBytes'] >= staged['manifestSize'] &&
        staged['totalBytes'] <= MAX_PAGE_PACKAGE_TOTAL_BYTES + MAX_POPUP_PACKAGE_MANIFEST_BYTES))
  );
}
