import type { ImageWorkspaceEntry, StoredImageWorkspaceEntry } from './contracts';
import { recoverImageWorkspacePublications } from '../image-aggregates/mutations';
import {
  hydrateImageWorkspaces,
  readImageWorkspace,
  readStoredImageWorkspace,
  readStoredImageWorkspaces,
} from './read';

export type { ImageWorkspaceEntry, StoredImageWorkspaceEntry } from './contracts';

export async function recoverAndGetImageWorkspace(
  aggregateId: string
): Promise<ImageWorkspaceEntry | undefined> {
  await recoverImageWorkspacePublications();
  return readImageWorkspace(aggregateId);
}

export async function recoverAndGetStoredImageWorkspace(
  aggregateId: string
): Promise<StoredImageWorkspaceEntry | undefined> {
  await recoverImageWorkspacePublications();
  return readStoredImageWorkspace(aggregateId);
}

export async function recoverAndListStoredImageWorkspaces(): Promise<StoredImageWorkspaceEntry[]> {
  await recoverImageWorkspacePublications();
  return readStoredImageWorkspaces();
}

export async function recoverAndListImageWorkspaces(): Promise<ImageWorkspaceEntry[]> {
  return hydrateImageWorkspaces(await recoverAndListStoredImageWorkspaces());
}
