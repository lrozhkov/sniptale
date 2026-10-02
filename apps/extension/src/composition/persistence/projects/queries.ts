import { initDB, VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoProjectEntry } from './read-guards';
import type { VideoProjectEntry } from './contracts';

/** Read valid project entries in descending update order without mutation dependencies. */
export async function listVideoProjectEntries(): Promise<VideoProjectEntry[]> {
  const db = await initDB();
  return (await db.getAll(VIDEO_PROJECTS_STORE))
    .map(parseVideoProjectEntry)
    .filter((entry): entry is VideoProjectEntry => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
