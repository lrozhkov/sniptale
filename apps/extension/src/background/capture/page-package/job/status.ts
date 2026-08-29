import type {
  PagePackageComponentId,
  PagePackageEffectiveComponentPlanV1,
  PagePackageExportOptionsV1,
  PagePackageJobIntent,
  PagePackageJobPhaseV1,
  PagePackageJobStatusV1,
  PagePackageProgressPhaseV1,
  PagePackageProgressStepV1,
  PagePackageProgressV1,
  PagePackageTerminalResultV1,
} from '@sniptale/runtime-contracts/page-package';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  MAX_POPUP_EXPORT_STATUS_TEXT_BYTES,
  MAX_POPUP_EXPORT_TAB_TITLE_BYTES,
  MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES,
  isCanonicalPopupExportJobId,
  parseExportResourceLimits,
} from '@sniptale/runtime-contracts/export';

export type { PagePackageJobStatusV1 } from '@sniptale/runtime-contracts/page-package';

const REQUIRED_STATUS_KEYS = [
  'activatedTabIds',
  'effectiveOptions',
  'effectiveComponentPlan',
  'intent',
  'jobId',
  'orderedTabs',
  'originalActiveTabs',
  'phase',
  'progress',
  'pageOutcomes',
  'revision',
  'warnings',
] as const;
const OPTIONAL_STATUS_KEYS = ['result'] as const;
const UTF8_ENCODER = new TextEncoder();
const MAX_JOB_TABS = MAX_POPUP_EXPORT_JOB_TABS;
const COMPONENT_IDS: PagePackageComponentId[] = [
  'attachments',
  'diagnostics',
  'images',
  'pageData',
  'webCopy',
];
const JOB_PHASES: readonly PagePackageJobPhaseV1[] = [
  'running',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
  'interrupted',
];
const PROGRESS_PHASES: readonly PagePackageProgressPhaseV1[] = [
  'idle',
  'scanning',
  'downloading',
  'zipping',
  'done',
  'cancelled',
  'error',
];
const PROGRESS_STEPS: readonly PagePackageProgressStepV1[] = [
  'annotations',
  'basicLogs',
  'cssDiagnostics',
  'files',
  'fullPageScreenshot',
  'viewportScreenshot',
  'images',
  'json',
  'markdown',
  'pageDiagnostics',
  'webSnapshotAssets',
  'webSnapshotDom',
  'webSnapshotPreview',
  'webSnapshotStyles',
  'webSnapshotWarnings',
];

function isBoundedText(value: unknown, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.length > 0) &&
    UTF8_ENCODER.encode(value).byteLength <= MAX_POPUP_EXPORT_STATUS_TEXT_BYTES
  );
}

function isBoundedJobId(value: unknown): value is string {
  return isCanonicalPopupExportJobId(value);
}

function isBoundedTabTitle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    UTF8_ENCODER.encode(value).byteLength <= MAX_POPUP_EXPORT_TAB_TITLE_BYTES
  );
}

function isBoundedWarnings(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_JOB_TABS) return false;
  let totalBytes = 0;
  for (const warning of value) {
    if (!isBoundedText(warning, true)) return false;
    totalBytes += UTF8_ENCODER.encode(warning).byteLength;
    if (totalBytes > MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES) return false;
  }
  return true;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => key in value) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function parseExportOptions(value: unknown): PagePackageExportOptionsV1 | null {
  const requiredBooleanKeys = [
    'includeBasicLogs',
    'includeCssDiagnostics',
    'includeFiles',
    'includeFullPageScreenshot',
    'includeImages',
    'includeJson',
    'includeMarkdown',
    'includePageDiagnostics',
  ] as const;
  const optionalBooleanKeys = ['includeAnnotations', 'includeViewportScreenshot'] as const;
  if (
    !isExactKeys(value, requiredBooleanKeys, [
      'includeAnnotations',
      'includeViewportScreenshot',
      'resourceLimits',
    ]) ||
    !requiredBooleanKeys.every((key) => typeof value[key] === 'boolean') ||
    !optionalBooleanKeys.every(
      (key) => value[key] === undefined || typeof value[key] === 'boolean'
    ) ||
    (value['resourceLimits'] !== undefined && !parseExportResourceLimits(value['resourceLimits']))
  )
    return null;
  return value as unknown as PagePackageExportOptionsV1;
}

function parseEffectiveComponentPlan(value: unknown): PagePackageEffectiveComponentPlanV1 | null {
  if (!isExactKeys(value, ['components', 'diagnosticsLevel', 'includeScreenshot'])) return null;
  const components = value['components'];
  if (
    !isExactKeys(components, COMPONENT_IDS) ||
    !COMPONENT_IDS.every((id) => typeof components[id] === 'boolean') ||
    (value['diagnosticsLevel'] !== 'none' &&
      value['diagnosticsLevel'] !== 'standard' &&
      value['diagnosticsLevel'] !== 'extended') ||
    typeof value['includeScreenshot'] !== 'boolean'
  )
    return null;
  return value as unknown as PagePackageEffectiveComponentPlanV1;
}

function parseProgress(value: unknown): PagePackageProgressV1 | null {
  if (
    !isExactKeys(
      value,
      ['current', 'errors', 'message', 'phase', 'total'],
      ['activeStepKey', 'completedStepKeys', 'failedStepKeys']
    ) ||
    !isNonNegativeInteger(value['current']) ||
    !isNonNegativeInteger(value['total']) ||
    !Array.isArray(value['errors']) ||
    value['errors'].length > MAX_JOB_TABS ||
    !value['errors'].every((entry) => isBoundedText(entry, true)) ||
    !isBoundedText(value['message'], true) ||
    !PROGRESS_PHASES.includes(value['phase'] as PagePackageProgressPhaseV1) ||
    !(
      value['activeStepKey'] === undefined ||
      value['activeStepKey'] === null ||
      PROGRESS_STEPS.includes(value['activeStepKey'] as PagePackageProgressStepV1)
    ) ||
    ![value['completedStepKeys'], value['failedStepKeys']].every(
      (keys) =>
        keys === undefined ||
        (Array.isArray(keys) &&
          keys.length <= PROGRESS_STEPS.length &&
          keys.every((key) => PROGRESS_STEPS.includes(key as PagePackageProgressStepV1)))
    )
  )
    return null;
  return value as unknown as PagePackageProgressV1;
}

function parseResult(value: unknown): PagePackageTerminalResultV1 | null {
  if (
    !isExactKeys(
      value,
      ['errors', 'stats', 'success'],
      ['filename', 'kind', 'snapshotBatchSize', 'snapshotIds', 'warnings']
    ) ||
    !Array.isArray(value['errors']) ||
    value['errors'].length > MAX_JOB_TABS ||
    !value['errors'].every((entry) => isBoundedText(entry, true)) ||
    !isExactKeys(value['stats'], ['filesCount', 'filesFailed', 'rowsCount', 'sectionsCount']) ||
    !Object.values(value['stats']).every(isNonNegativeInteger) ||
    typeof value['success'] !== 'boolean' ||
    !(value['filename'] === undefined || isBoundedText(value['filename'], true)) ||
    !(
      value['kind'] === undefined ||
      value['kind'] === 'archive' ||
      value['kind'] === 'webSnapshot'
    ) ||
    !(
      value['snapshotBatchSize'] === undefined || isNonNegativeInteger(value['snapshotBatchSize'])
    ) ||
    !(
      value['snapshotIds'] === undefined ||
      (Array.isArray(value['snapshotIds']) &&
        value['snapshotIds'].length <= MAX_JOB_TABS &&
        value['snapshotIds'].every((entry) => isBoundedText(entry)))
    ) ||
    !(
      value['warnings'] === undefined ||
      (Array.isArray(value['warnings']) &&
        value['warnings'].length <= MAX_JOB_TABS &&
        value['warnings'].every((entry) => isBoundedText(entry, true)))
    )
  )
    return null;
  return value as unknown as PagePackageTerminalResultV1;
}

function parseOrderedTabs(value: unknown): PagePackageJobStatusV1['orderedTabs'] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_JOB_TABS) return null;
  const tabIds = new Set<number>();
  for (const tab of value) {
    if (!isExactKeys(tab, ['tabId', 'title'])) return null;
    const tabId = tab['tabId'];
    if (!isNonNegativeInteger(tabId) || !isBoundedTabTitle(tab['title']) || tabIds.has(tabId)) {
      return null;
    }
    tabIds.add(tabId);
  }
  return value as PagePackageJobStatusV1['orderedTabs'];
}

function parseOriginalTabs(value: unknown): PagePackageJobStatusV1['originalActiveTabs'] | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_JOB_TABS ||
    value.some(
      (entry) =>
        !isExactKeys(entry, ['tabId', 'windowId']) ||
        !isNonNegativeInteger(entry['tabId']) ||
        !isNonNegativeInteger(entry['windowId'])
    )
  )
    return null;
  return value as PagePackageJobStatusV1['originalActiveTabs'];
}

export function parsePagePackageJobStatusV1(value: unknown): PagePackageJobStatusV1 | null {
  if (!isExactKeys(value, REQUIRED_STATUS_KEYS, OPTIONAL_STATUS_KEYS)) return null;
  const orderedTabs = parseOrderedTabs(value['orderedTabs']);
  const options = parseExportOptions(value['effectiveOptions']);
  const componentPlan = parseEffectiveComponentPlan(value['effectiveComponentPlan']);
  const progress = parseProgress(value['progress']);
  const originalTabs = parseOriginalTabs(value['originalActiveTabs']);
  const result = value['result'] === undefined ? undefined : parseResult(value['result']);
  const outcomes = value['pageOutcomes'];
  if (
    !orderedTabs ||
    !options ||
    !componentPlan ||
    !progress ||
    !originalTabs ||
    result === null ||
    (value['intent'] !== 'export' && value['intent'] !== 'save') ||
    !isBoundedJobId(value['jobId']) ||
    !isNonNegativeInteger(value['revision']) ||
    value['revision'] === 0 ||
    !JOB_PHASES.includes(value['phase'] as PagePackageJobPhaseV1) ||
    !isBoundedWarnings(value['warnings']) ||
    !Array.isArray(value['activatedTabIds']) ||
    value['activatedTabIds'].length > MAX_JOB_TABS ||
    !value['activatedTabIds'].every(isNonNegativeInteger) ||
    !Array.isArray(outcomes) ||
    outcomes.length !== orderedTabs.length ||
    outcomes.some(
      (outcome, ordinal) =>
        !isExactKeys(outcome, ['ordinal', 'status', 'tabId'], ['error']) ||
        outcome['ordinal'] !== ordinal ||
        outcome['tabId'] !== orderedTabs[ordinal]!.tabId ||
        (outcome['status'] !== 'pending' &&
          outcome['status'] !== 'succeeded' &&
          outcome['status'] !== 'failed') ||
        !(outcome['error'] === undefined || isBoundedText(outcome['error'], true))
    )
  )
    return null;
  return structuredClone(value as unknown as PagePackageJobStatusV1);
}

export function clonePagePackageJobStatus(status: PagePackageJobStatusV1): PagePackageJobStatusV1 {
  return structuredClone(status);
}

export type PagePackageJobStatusPatch = Partial<
  Omit<PagePackageJobStatusV1, 'intent' | 'jobId' | 'revision'>
>;

export function createEffectiveComponentPlan(
  intent: PagePackageJobIntent,
  options: PagePackageExportOptionsV1,
  includeWebCopy = intent === 'save'
): PagePackageEffectiveComponentPlanV1 {
  const diagnosticsEnabled =
    options.includeBasicLogs || options.includeCssDiagnostics || options.includePageDiagnostics;
  const diagnosticsLevel = options.includePageDiagnostics
    ? 'extended'
    : diagnosticsEnabled
      ? 'standard'
      : 'none';
  return {
    components: {
      attachments: options.includeFiles,
      diagnostics: diagnosticsEnabled,
      images: options.includeImages || options.includeViewportScreenshot === true,
      pageData: options.includeJson || options.includeMarkdown,
      webCopy: includeWebCopy,
    },
    diagnosticsLevel,
    includeScreenshot: includeWebCopy || options.includeFullPageScreenshot,
  };
}

export function isPagePackageJobTerminalPhase(phase: PagePackageJobPhaseV1): boolean {
  return phase !== 'running' && phase !== 'cancelling';
}
