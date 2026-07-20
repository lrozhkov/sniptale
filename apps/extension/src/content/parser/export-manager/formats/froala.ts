import type { FileResource } from '@sniptale/runtime-contracts/export';
import { createLogger } from '@sniptale/platform/observability/logger';
import { collectFroalaImages } from '../../dom-tree-parser/froala';
import { generateFilename } from '../files/utils';
import type { ExportDiagnosticsSource } from '../diagnostics/source';

const logger = createLogger({ namespace: 'ContentExportManager' });

export async function collectFroalaImageResources(
  onProgress: (current: number, total: number, message: string) => void,
  source?: ExportDiagnosticsSource
): Promise<{ resources: FileResource[]; previewToDownloadMap: Map<string, string> }> {
  const resources: FileResource[] = [];
  const previewToDownloadMap = new Map<string, string>();
  const seenUrls = new Set<string>();
  let fileIndex = 0;

  try {
    const froalaImages = await collectFroalaImages(onProgress, source?.document, source?.pageUrl);

    for (const img of froalaImages) {
      if (img.uuid && img.downloadUuid) {
        previewToDownloadMap.set(img.uuid, img.downloadUuid);
      }

      const url = img.fullUrl || img.previewSrc;
      if (!url || seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      const fallbackName = img.source.context
        ? `${img.source.context}_${img.downloadUuid || img.uuid}`
        : `froala_${img.downloadUuid || img.uuid}`;

      resources.push({
        url,
        filename: generateFilename(url, fallbackName, ++fileIndex),
        source: 'dynamic',
        ...(typeof img.source.context === 'undefined' ? {} : { tableName: img.source.context }),
      });
    }
  } catch (error) {
    logger.error('Error collecting Froala images', error);
  }

  return { resources, previewToDownloadMap };
}
