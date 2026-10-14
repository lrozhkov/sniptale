import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';
import type { VideoWorkspace, VideoWorkspaceProject } from './contracts';

const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Admits project metadata without modifying history or source evidence. */
export function parseWorkspaceProject(value: unknown): VideoWorkspaceProject | null {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    value['name'].trim().length === 0 ||
    value['name'].length > 256 ||
    !isRecord(value['lifecycle'])
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: 0,
  });
  if (
    !lifecycle ||
    lifecycle.storageClass !== 'library' ||
    lifecycle.savedAt === null ||
    !timestamp(lifecycle.savedAt) ||
    !timestamp(lifecycle.updatedAt)
  )
    return null;
  return {
    name: value['name'],
    lifecycle: { ...lifecycle, storageClass: 'library', savedAt: lifecycle.savedAt },
  };
}

/** Materializes legacy metadata only during an explicit accepted mutation. */
export function materializeVideoWorkspaceProject(
  workspace: VideoWorkspace,
  sourceName: string
): VideoWorkspace & { project: VideoWorkspaceProject } {
  if (workspace.project) return { ...workspace, project: workspace.project };
  return {
    ...workspace,
    formatVersion: workspace.formatVersion === 2 ? 4 : 3,
    project: {
      name: sourceName.trim().slice(0, 256) || 'Video project',
      lifecycle: {
        storageClass: 'library',
        savedAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    },
  };
}
