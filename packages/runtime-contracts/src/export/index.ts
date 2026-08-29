import type { FieldContentRole } from '../dom-tree';
import { estimateUtf8Bytes } from '../validation/base64';
import { MAX_PAGE_PACKAGE_TITLE_BYTES } from '../page-package/contracts';

export const MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES = 5 * 1024 * 1024;

export function isBrowserAnnotationsExportText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    estimateUtf8Bytes(value, MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES) <=
      MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES
  );
}

// ========================================
// Export Types
// ========================================

/**
 * Состояние прогресса экспорта
 */
export type ExportProgressStepKey =
  | 'annotations'
  | 'json'
  | 'markdown'
  | 'files'
  | 'images'
  | 'basicLogs'
  | 'pageDiagnostics'
  | 'cssDiagnostics'
  | 'fullPageScreenshot'
  | 'viewportScreenshot'
  | 'webSnapshotPreview'
  | 'webSnapshotDom'
  | 'webSnapshotStyles'
  | 'webSnapshotAssets'
  | 'webSnapshotWarnings';

export interface ExportProgress {
  activeStepKey?: ExportProgressStepKey | null;
  completedStepKeys?: ExportProgressStepKey[];
  failedStepKeys?: ExportProgressStepKey[];
  phase: 'idle' | 'scanning' | 'downloading' | 'zipping' | 'done' | 'cancelled' | 'error';
  message: string;
  current: number; // текущий элемент
  total: number; // всего элементов
  errors: string[]; // список ошибок
}

/**
 * Опции экспорта
 */
export interface ExportOptions {
  includeAnnotations?: boolean; // включить browser-annotations.md
  includeJson: boolean; // включить JSON (data.json)
  includeMarkdown: boolean; // включить Markdown (data.md)
  includeFiles: boolean; // включить файлы
  includeImages: boolean; // обрабатывать изображения из Froala/preview popup
  includeBasicLogs: boolean; // включить базовый bundle логов сайта
  includePageDiagnostics: boolean;
  includeCssDiagnostics: boolean; // включить stylesheets/computed-styles bundle
  includeFullPageScreenshot: boolean; // включить full-page screenshot в корень архива
  includeViewportScreenshot?: boolean; // включить отдельный screenshot видимой области
}

/**
 * Ресурс для скачивания
 */
export interface FileResource {
  url: string;
  filename: string;
  source: 'direct' | 'dynamic'; // прямая ссылка или из модального окна
  rowId?: string; // ID строки таблицы (для связи с JSON)
  columnName?: string; // Имя колонки
  tableName?: string; // Название таблицы/секции
}

/**
 * Данные для экспорта в JSON
 */
export interface ExportData {
  meta: {
    url: string;
    title: string;
    date: string;
    userAgent: string;
  };
  sections: ExportSection[];
}

/**
 * Секция данных для экспорта
 */
export interface ExportSection {
  title: string;
  fields?: Array<{
    label: string;
    value: string;
    type: 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status';
    contentRole?: FieldContentRole;
    linkRef?: string;
  }>;
  tables?: Array<{
    title: string;
    headers: string[];
    rows: Array<{
      data: Record<string, string>;
      attachments: string[]; // имена файлов в архиве
    }>;
  }>;
}

/**
 * Результат экспорта
 */
export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  errors: string[];
  stats: {
    sectionsCount: number;
    rowsCount: number;
    filesCount: number;
    filesFailed: number;
  };
}

export interface PopupExportPreview {
  title: string;
  context: string;
  jsonPreview: string;
  markdownPreview: string;
  sectionsCount: number;
  rowsCount: number;
}

export interface PopupExportPreviewResponse {
  success: boolean;
  preview?: PopupExportPreview;
  error?: string;
}

export interface ExportPagePackageEntry {
  path: string;
  textContent?: string;
  binaryBase64?: string;
  mimeType?: string;
}

export interface ExportPagePackage {
  archiveBaseName: string;
  entries: ExportPagePackageEntry[];
  errors: string[];
  stats: ExportResult['stats'];
}

export interface PopupExportPackageResponse {
  success: boolean;
  stagedPagePackage?: {
    jobId: string;
    manifestSha256: string;
    manifestSize: number;
    ordinal: number;
    pageId: string;
    producerStats: ExportResult['stats'];
    snapshotSessionId?: string;
    stagedBlobId: string;
    title: string | null;
    totalBytes: number;
  };
  error?: string;
}

export interface PopupExportResult {
  success: boolean;
  kind?: 'archive' | 'webSnapshot';
  filename?: string;
  errors: string[];
  stats: ExportResult['stats'];
  snapshotBatchSize?: number;
  snapshotIds?: string[];
  warnings?: string[];
}

export const MAX_POPUP_EXPORT_JOB_ID_BYTES = 128;
export const MAX_POPUP_EXPORT_JOB_TABS = 256;
export const MAX_POPUP_EXPORT_STATUS_TEXT_BYTES = 16 * 1024;
export const MAX_POPUP_EXPORT_TAB_TITLE_BYTES = MAX_PAGE_PACKAGE_TITLE_BYTES;
export const MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES = 512 * 1024;
const POPUP_EXPORT_JOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isCanonicalPopupExportJobId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    estimateUtf8Bytes(value, MAX_POPUP_EXPORT_JOB_ID_BYTES) <= MAX_POPUP_EXPORT_JOB_ID_BYTES &&
    POPUP_EXPORT_JOB_ID_PATTERN.test(value)
  );
}

function truncateUtf8Text(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const characterBytes = estimateUtf8Bytes(character, maxBytes);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export function normalizePopupExportTabTitle(value: string): string {
  const bounded = truncateUtf8Text(value, MAX_POPUP_EXPORT_TAB_TITLE_BYTES).normalize('NFC');
  return truncateUtf8Text(bounded, MAX_POPUP_EXPORT_TAB_TITLE_BYTES);
}

export function truncatePopupExportStatusText(value: string): string {
  return truncateUtf8Text(value, MAX_POPUP_EXPORT_STATUS_TEXT_BYTES);
}
