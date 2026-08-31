import type {
  ExportOptions,
  ExportPagePackage,
  ExportResult,
} from '@sniptale/runtime-contracts/export';
import { createArchiveArtifact, type ArchiveArtifact } from '../archive/artifacts';
import type { ArchiveAsset } from '../archive';

const BROWSER_ANNOTATIONS_EXPORT_FILENAME = 'browser-annotations.md';
const BROWSER_ANNOTATIONS_MIME_TYPE = 'text/markdown;charset=utf-8';

function createEmptyExportStats(): ExportResult['stats'] {
  return {
    sectionsCount: 0,
    rowsCount: 0,
    filesCount: 0,
    filesFailed: 0,
  };
}

export function hasOnlyBrowserAnnotations(options: ExportOptions): boolean {
  return (
    Boolean(options.includeAnnotations) &&
    !options.includeJson &&
    !options.includeMarkdown &&
    !options.includeFiles &&
    !options.includeImages &&
    !options.includeBasicLogs &&
    !options.includePageDiagnostics &&
    !options.includeCssDiagnostics &&
    !options.includeFullPageScreenshot &&
    !options.includeViewportScreenshot
  );
}

export function createBrowserAnnotationsArchiveAsset(text: string): ArchiveAsset {
  return {
    path: BROWSER_ANNOTATIONS_EXPORT_FILENAME,
    content: text,
  };
}

export function createBrowserAnnotationsPagePackage(
  text: string,
  archiveBaseName: string
): ArchiveArtifact {
  return createArchiveArtifact({
    archiveBaseName,
    entries: [
      {
        path: BROWSER_ANNOTATIONS_EXPORT_FILENAME,
        textContent: text,
        mimeType: BROWSER_ANNOTATIONS_MIME_TYPE,
      },
    ],
    errors: [],
    stats: createEmptyExportStats(),
  });
}

export function createBrowserAnnotationsExportResult(
  pagePackage: Pick<ExportPagePackage, 'entries'>
): Omit<ExportResult, 'errors' | 'success'> {
  const text = pagePackage.entries[0]?.textContent;
  if (typeof text !== 'string') {
    throw new Error('Browser annotations export text is unavailable');
  }

  return {
    blob: new Blob([text], { type: BROWSER_ANNOTATIONS_MIME_TYPE }),
    filename: BROWSER_ANNOTATIONS_EXPORT_FILENAME,
    stats: createEmptyExportStats(),
  };
}
