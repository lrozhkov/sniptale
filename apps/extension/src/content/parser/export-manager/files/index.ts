import { createLogger } from '@sniptale/platform/observability/logger';
import type { FileResource } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  dismissPreviewModal,
  getCurrentExportPageUrl,
  listDirectDownloadLinks,
  listPreviewTriggers,
  resolvePreviewDownloadHref,
} from '../diagnostics/dom-driver';
import type { ExportDiagnosticsSource } from '../diagnostics/source';
import { generateFilename, isIntermediateDownloadPageUrl, isValidDownloadUrl } from './utils';
export { collectFroalaImageResources } from '../formats/froala';
export { downloadFileResources } from './download';

const logger = createLogger({ namespace: 'ContentExportManager' });

function createFileResource(args: {
  url: string;
  filename: string;
  source: FileResource['source'];
  rowId: string | undefined;
  columnName: string | undefined;
  tableName: string | undefined;
}): FileResource {
  return {
    url: args.url,
    filename: args.filename,
    source: args.source,
    ...(args.rowId === undefined ? {} : { rowId: args.rowId }),
    ...(args.columnName === undefined ? {} : { columnName: args.columnName }),
    ...(args.tableName === undefined ? {} : { tableName: args.tableName }),
  };
}

function resolveDirectLinkContext(link: Element, tree: ParsedDOMTree) {
  const row = link.closest('tr.tableRow');
  const rowId = row?.getAttribute('data-sniptale-id') || undefined;
  const cell = link.closest('td');
  if (!row || !cell) {
    return { row, rowId, columnName: undefined, tableName: undefined };
  }

  const cellIndex = Array.from(cell.parentElement?.children || []).indexOf(cell);
  const matchingTables: Array<{ headers: string[]; sectionTitle: string }> = [];
  for (const section of tree.structure) {
    for (const child of section.children) {
      if (child.type !== 'table') {
        continue;
      }

      const table = child as TableNode;
      const matchesRow = rowId ? table.rows.some((tableRow) => tableRow.id === rowId) : false;
      if (matchesRow && cellIndex >= 0 && cellIndex < table.headers.length) {
        return { row, rowId, columnName: table.headers[cellIndex], tableName: section.title };
      }

      if (cellIndex >= 0 && cellIndex < table.headers.length) {
        matchingTables.push({ headers: table.headers, sectionTitle: section.title });
      }
    }
  }

  if (matchingTables.length === 1) {
    const matchingTable = matchingTables[0];
    if (!matchingTable) {
      return { row, rowId, columnName: undefined, tableName: undefined };
    }

    return {
      row,
      rowId,
      columnName: matchingTable.headers[cellIndex],
      tableName: matchingTable.sectionTitle,
    };
  }

  return { row, rowId, columnName: undefined, tableName: undefined };
}

function findFallbackName(row: Element | null, href: string): string {
  const rowCells = row?.querySelectorAll('td') || [];
  for (const cell of rowCells) {
    const text = cell.textContent?.trim() || '';
    if (text && !text.includes(href) && text.length > 2 && text.length < 100) {
      return text;
    }
  }
  return '';
}

export function collectDirectLinks(
  tree: ParsedDOMTree,
  source?: ExportDiagnosticsSource
): FileResource[] {
  const resources: FileResource[] = [];
  const seenUrls = new Set<string>();
  let fileIndex = 0;

  listDirectDownloadLinks(source?.document).forEach((link) => {
    const href = link.href;
    const pageUrl = getCurrentExportPageUrl(source?.pageUrl);
    if (
      !isValidDownloadUrl(href, pageUrl) ||
      isIntermediateDownloadPageUrl(href) ||
      seenUrls.has(href)
    ) {
      return;
    }

    seenUrls.add(href);
    const { row, rowId, columnName, tableName } = resolveDirectLinkContext(link, tree);
    const fallbackName = columnName ? findFallbackName(row, href) : '';

    resources.push(
      createFileResource({
        url: href,
        filename: generateFilename(href, fallbackName, ++fileIndex),
        source: 'direct',
        rowId,
        columnName,
        tableName,
      })
    );
  });

  return resources;
}

async function collectPreviewDownload(
  element: HTMLElement,
  fallbackName: string,
  fileIndex: number,
  pageUrl?: string
): Promise<FileResource | null> {
  const downloadHref = await resolvePreviewDownloadHref(element, pageUrl);
  if (!downloadHref) {
    return null;
  }

  return {
    ...createFileResource({
      url: downloadHref,
      filename: generateFilename(downloadHref, fallbackName, fileIndex),
      source: 'dynamic',
      rowId: element.closest('tr.tableRow')?.getAttribute('data-sniptale-id') || undefined,
      columnName: undefined,
      tableName: undefined,
    }),
  };
}

async function processPreviewElement(args: {
  element: HTMLElement;
  fileIndex: number;
  previewIndex: number;
  source?: ExportDiagnosticsSource | undefined;
}): Promise<FileResource | null> {
  const fallbackName =
    args.element.getAttribute('alt') ||
    args.element.getAttribute('title') ||
    `image_${args.previewIndex + 1}`;

  return collectPreviewDownload(
    args.element,
    fallbackName,
    args.fileIndex + 1,
    args.source?.pageUrl
  );
}

export async function collectDynamicLinks(
  onProgress: (current: number, total: number, message: string) => void,
  isCancelled: () => boolean,
  source?: ExportDiagnosticsSource
): Promise<FileResource[]> {
  const resources: FileResource[] = [];
  const seenUrls = new Set<string>();
  const previewElements = listPreviewTriggers(source?.document);

  let fileIndex = 0;

  for (let i = 0; i < previewElements.length; i++) {
    if (isCancelled()) break;

    const element = previewElements[i];
    if (!element) {
      continue;
    }

    onProgress(
      i + 1,
      previewElements.length,
      `Обработка превью ${i + 1} из ${previewElements.length}...`
    );

    try {
      const resource = await processPreviewElement({
        element,
        fileIndex,
        previewIndex: i,
        source,
      });
      if (resource && !seenUrls.has(resource.url)) {
        seenUrls.add(resource.url);
        fileIndex++;
        resources.push(resource);
      }

      await dismissPreviewModal(source?.document);
    } catch (error) {
      logger.warn('Error processing preview', error);
      await dismissPreviewModal(source?.document);
    }
  }

  return resources;
}
