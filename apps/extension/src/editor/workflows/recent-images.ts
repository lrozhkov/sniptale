import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
  getMediaThumbnail,
  listMediaLibrary,
} from '../../composition/persistence/media-library';
import { getAggregatePresentation } from '../../composition/persistence/aggregate-presentations';
import { formatDateTime, getCurrentLocale, translate, type AppLocale } from '../../platform/i18n';

/** Lists reusable image metadata for the start page and transient recent chooser. */
export async function listRecentEditorImages(
  detail: 'dimensions' | 'source' = 'dimensions',
  locale: AppLocale = getCurrentLocale()
) {
  const images = await listMediaLibrary();
  return images
    .filter(
      (item) =>
        (item.kind === 'image' || item.kind === 'screenshot') &&
        item.lifecycle?.trashedAt === undefined
    )
    .map((item) => ({
      id: item.id,
      title: item.filename,
      detail:
        detail === 'source'
          ? `${recentImageSource(item.sourceUrl, item.kind, locale)}\n${formatDateTime(
              item.updatedAt,
              { dateStyle: 'short', timeStyle: 'short' },
              locale
            )}`
          : [item.width, item.height].every((value) => typeof value === 'number')
            ? `${item.width} × ${item.height}`
            : '',
      updatedAt: item.updatedAt,
      thumbnailId: item.id,
    }));
}

function recentImageSource(url: string | null | undefined, kind: string, locale: AppLocale) {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.hostname;
    } catch {
      // Missing or invalid provenance uses the local source label.
    }
  }
  return translate(
    kind === 'screenshot' ? 'editor.recentImages.screenCapture' : 'editor.recentImages.file',
    locale
  );
}

/** Prefers a current edited presentation and uses the original image while it is unavailable. */
export async function readRecentEditorThumbnail(id: string): Promise<Blob | undefined> {
  const entry = await getMediaLibraryEntry(id);
  if (!entry || entry.lifecycle?.trashedAt !== undefined) return undefined;
  const revision = entry.workspaceRevision ?? 0;
  const presentation = await getAggregatePresentation({ kind: 'image', id });
  const blob =
    (presentation?.presentationRevision === revision
      ? (presentation.previewBlob ?? presentation.thumbnailBlob)
      : undefined) ??
    (await getMediaThumbnail(id))?.blob ??
    (await getMediaAssetBlob(id));
  const latest = await getMediaLibraryEntry(id);
  return latest &&
    latest.lifecycle?.trashedAt === undefined &&
    (latest.workspaceRevision ?? 0) === revision
    ? blob
    : undefined;
}
