import type { FieldContentRole } from '../dom-tree';

// ========================================
// Export Types
// ========================================

/**
 * Состояние прогресса экспорта
 */
export type ExportProgressStepKey =
  | 'json'
  | 'markdown'
  | 'files'
  | 'images'
  | 'basicLogs'
  | 'harDomLogs'
  | 'cssDiagnostics'
  | 'fullPageScreenshot'
  | 'webSnapshotPreview'
  | 'webSnapshotDom'
  | 'webSnapshotStyles'
  | 'webSnapshotAssets'
  | 'webSnapshotWarnings';

export interface ExportProgress {
  activeStepKey?: ExportProgressStepKey | null;
  phase: 'idle' | 'scanning' | 'downloading' | 'zipping' | 'done' | 'error';
  message: string;
  current: number; // текущий элемент
  total: number; // всего элементов
  errors: string[]; // список ошибок
}

/**
 * Опции экспорта
 */
export interface ExportOptions {
  includeJson: boolean; // включить JSON (data.json)
  includeMarkdown: boolean; // включить Markdown (data.md)
  includeFiles: boolean; // включить файлы
  includeImages: boolean; // обрабатывать изображения из Froala/preview popup
  includeBasicLogs: boolean; // включить базовый bundle логов сайта
  includeHarDomLogs: boolean; // включить HAR/DOM bundle
  includeCssDiagnostics: boolean; // включить stylesheets/computed-styles bundle
  includeFullPageScreenshot: boolean; // включить full-page screenshot в корень архива
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
  pagePackage?: ExportPagePackage;
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
