import type { VideoProject } from '../../../features/video/project/types';
import { initDB, VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoProjectEntryResult } from './read-guards';

/**
 * Checks fresh canonical metadata against a snapshot admitted by the full project reader.
 * This is not asset admission: the caller must complete full integrity validation first.
 * The final row read is followed only by synchronous metadata validation and comparison.
 */
export async function isCurrentVideoProjectSnapshot(
  project: VideoProject,
  workspaceRevision: number
): Promise<boolean> {
  const db = await initDB();
  const result = parseVideoProjectEntryResult(await db.get(VIDEO_PROJECTS_STORE, project.id));
  if (result.status !== 'ready') return false;
  const entry = result.entry;
  return (
    entry.id === project.id &&
    entry.project.id === project.id &&
    (entry.workspaceRevision ?? 0) === workspaceRevision &&
    entry.lifecycle?.trashedAt === undefined &&
    JSON.stringify(entry.project) === JSON.stringify(project)
  );
}
