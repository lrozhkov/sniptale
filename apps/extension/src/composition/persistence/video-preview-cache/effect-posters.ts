import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { defaultVideoPreviewCacheDatabase, type VideoPreviewCacheDatabasePort } from './database';
import {
  beginVideoPreviewCacheJob,
  hasCurrentVideoPreviewCacheInstance,
  type VideoPreviewCacheJobToken,
} from './jobs';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_COUNT = 128;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
type Poster = { blob: Blob; createdAt: number };
function parse(value: unknown): Poster | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<Poster>;
  return row.blob instanceof Blob &&
    row.blob.type === 'image/webp' &&
    row.blob.size > 0 &&
    row.blob.size <= 512 * 1024 &&
    Number.isFinite(row.createdAt)
    ? (row as Poster)
    : null;
}

/** Rebuildable generic covers only. Reads never refresh retention or rewrite pixels. */
export function createEffectPosterStore(
  database: VideoPreviewCacheDatabasePort = defaultVideoPreviewCacheDatabase,
  now = Date.now
) {
  return {
    begin: () => beginVideoPreviewCacheJob({ database, randomUUID: () => crypto.randomUUID() }),
    async load(key: string): Promise<Blob | null> {
      const row = parse(await database.readExisting((tx) => tx.getPoster(key)));
      return row && now() - row.createdAt < MAX_AGE ? row.blob : null;
    },
    async commit(token: VideoPreviewCacheJobToken, key: string, blob: Blob) {
      const row = parse({ blob, createdAt: now() });
      if (!row) return;
      await runWithPersistenceMutationPermit(() =>
        database.mutateExisting(async (tx) => {
          if (!(await hasCurrentVideoPreviewCacheInstance(tx, token))) return;
          const existing = parse(await tx.getPoster(key));
          if (existing && now() - existing.createdAt < MAX_AGE) return;
          await tx.putPoster(key, row);
          const entries = (await tx.listPosterEntries()).map(({ key, value }) => ({
            key,
            row: parse(value),
          }));
          entries.sort(
            (a, b) =>
              (b.row?.createdAt ?? 0) - (a.row?.createdAt ?? 0) || a.key.localeCompare(b.key)
          );
          let bytes = 0;
          let count = 0;
          for (const entry of entries) {
            if (entry.row) {
              bytes += entry.row.blob.size;
              count++;
            }
            if (
              !entry.row ||
              now() - entry.row.createdAt >= MAX_AGE ||
              count > MAX_COUNT ||
              bytes > MAX_BYTES
            )
              await tx.deletePoster(entry.key);
          }
        })
      );
    },
  };
}
