import { createLogger } from '@sniptale/platform/observability/logger';
import { IMAGE_WORKSPACES_STORE, initDB } from '../infrastructure/indexed-db/core';
import type { ImageWorkspaceEntry } from './contracts';
import { parseImageWorkspaceEntry } from './parser';

const logger = createLogger({ namespace: 'ImageWorkspacesDb' });

export type { ImageWorkspaceEntry } from './contracts';

export async function getImageWorkspace(
  aggregateId: string
): Promise<ImageWorkspaceEntry | undefined> {
  const db = await initDB();
  const raw: unknown = await db.get(IMAGE_WORKSPACES_STORE, aggregateId);
  const entry = parseImageWorkspaceEntry(raw);
  if (!entry && raw !== undefined) {
    logger.warn('Ignoring invalid image workspace entry', { aggregateId });
  }
  return entry ?? undefined;
}

export async function listImageWorkspaces(): Promise<ImageWorkspaceEntry[]> {
  const db = await initDB();
  return (await db.getAll(IMAGE_WORKSPACES_STORE))
    .map(parseImageWorkspaceEntry)
    .filter((entry): entry is ImageWorkspaceEntry => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
