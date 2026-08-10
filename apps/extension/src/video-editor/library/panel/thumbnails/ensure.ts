import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import {
  commitProjectAggregatePresentation,
  getAggregatePresentation,
} from '../../../../composition/persistence/aggregate-presentations';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import {
  createLegacyLibraryThumbnailService,
  LIBRARY_THUMBNAIL_HEIGHT,
  LIBRARY_THUMBNAIL_WIDTH,
  renderLibraryThumbnail,
  type LegacyLibraryThumbnailDeps,
} from './legacy-media';
import type { LibraryThumbnailItem } from './types';

interface LibraryThumbnailServiceDeps extends LegacyLibraryThumbnailDeps {
  commitProjectAggregatePresentation?: typeof commitProjectAggregatePresentation;
  getAggregatePresentation?: typeof getAggregatePresentation;
}

interface LibraryThumbnailService {
  ensureThumbnail: (item: LibraryThumbnailItem) => Promise<MediaThumbnailEntry | undefined>;
}

function isVideoProjectThumbnail(item: LibraryThumbnailItem): boolean {
  return item.thumbnailId === `video-project:${item.id}`;
}

function mapProjectPresentation(
  item: LibraryThumbnailItem,
  blob: Blob,
  updatedAt: number
): MediaThumbnailEntry {
  return {
    assetId: item.thumbnailId,
    blob,
    createdAt: item.createdAt,
    height: LIBRARY_THUMBNAIL_HEIGHT,
    updatedAt,
    width: LIBRARY_THUMBNAIL_WIDTH,
  };
}

export function createLibraryThumbnailService(
  deps: LibraryThumbnailServiceDeps = {}
): LibraryThumbnailService {
  const getPresentation = deps.getAggregatePresentation ?? getAggregatePresentation;
  const commitPresentation =
    deps.commitProjectAggregatePresentation ?? commitProjectAggregatePresentation;
  const ensureLegacyThumbnail = createLegacyLibraryThumbnailService(deps);
  const pendingProjectLoads = new Map<string, Promise<MediaThumbnailEntry | undefined>>();

  return {
    ensureThumbnail: async (item) => {
      if (!isVideoProjectThumbnail(item)) return ensureLegacyThumbnail(item);
      const pending = pendingProjectLoads.get(item.thumbnailId);
      if (pending) return pending;

      const next = (async () => {
        const expectedWorkspaceRevision = item.workspaceRevision ?? 0;
        const ref = { id: item.id, kind: 'video-project' } as const;
        const existing = await getPresentation(ref);
        if (existing?.presentationRevision === expectedWorkspaceRevision) {
          return mapProjectPresentation(item, existing.thumbnailBlob, existing.updatedAt);
        }
        const rendered = await renderLibraryThumbnail(item, deps);
        if (!rendered) return undefined;
        const committed = await commitPresentation({
          expectedWorkspaceRevision,
          ref,
          thumbnailBlob: rendered.blob,
        });
        return mapProjectPresentation(item, committed.thumbnailBlob, committed.updatedAt);
      })()
        .catch(() => undefined)
        .finally(() => pendingProjectLoads.delete(item.thumbnailId));
      pendingProjectLoads.set(item.thumbnailId, next);
      return next;
    },
  };
}

const defaultLibraryThumbnailService = createLazyDefaultOwner(createLibraryThumbnailService);

export async function ensureLibraryThumbnail(
  item: LibraryThumbnailItem
): Promise<MediaThumbnailEntry | undefined> {
  return defaultLibraryThumbnailService.getOwner().ensureThumbnail(item);
}
