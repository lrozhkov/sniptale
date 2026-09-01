import type { VideoProject } from '../video/project/public';

interface RecordingReferenceCollectorArgs {
  mediaEntries: readonly unknown[];
  projectExports: readonly unknown[];
  projects: readonly unknown[];
}

interface RecordingReferenceCollection {
  invalidReferenceCount: number;
  recordingIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function collectRecordingSource(
  recordingIds: Set<string>,
  source: unknown
): Record<string, unknown> | null {
  if (!isRecord(source) || !isString(source['kind'])) return null;
  if (source['kind'] !== 'recording') return source;
  if (!isString(source['recordingId'])) return null;
  recordingIds.add(source['recordingId']);
  return source;
}

function collectFromMediaSource(recordingIds: Set<string>, source: unknown): boolean {
  const parsed = collectRecordingSource(recordingIds, source);
  if (!parsed) return false;
  if (parsed['kind'] === 'recording') return true;
  if (parsed['kind'] === 'project-export') {
    return isString(parsed['exportId']) && isString(parsed['projectId']);
  }
  if (parsed['kind'] === 'screenshot') {
    return true;
  }
  if (parsed['kind'] === 'project-asset') {
    return isString(parsed['projectAssetId']);
  }
  if (parsed['kind'] === 'web-snapshot') {
    return isString(parsed['snapshotId']);
  }
  return false;
}

function collectFromProjectSource(recordingIds: Set<string>, source: unknown): boolean {
  const parsed = collectRecordingSource(recordingIds, source);
  if (!parsed) return false;
  if (parsed['kind'] === 'recording') return true;
  if (parsed['kind'] === 'manual') {
    return true;
  }
  if (parsed['kind'] === 'scenario') {
    return isString(parsed['scenarioProjectId']);
  }
  return false;
}

function collectFromProjectAssetSource(recordingIds: Set<string>, source: unknown): boolean {
  const parsed = collectRecordingSource(recordingIds, source);
  if (!parsed) return false;
  if (parsed['kind'] === 'recording') return true;
  if (parsed['kind'] === 'project-asset') {
    const isValid = isString(parsed['projectAssetId']);
    if (parsed['originRecordingId'] !== undefined) {
      if (!isString(parsed['originRecordingId'])) {
        return false;
      }
      recordingIds.add(parsed['originRecordingId']);
    }
    return isValid;
  }
  if (parsed['kind'] === 'scenario-asset') {
    return isString(parsed['scenarioAssetId']);
  }
  return false;
}

function collectFromMediaEntry(recordingIds: Set<string>, entry: unknown): boolean {
  return isRecord(entry) && collectFromMediaSource(recordingIds, entry['source']);
}

function collectFromProjectExport(entry: unknown): boolean {
  return isRecord(entry) && isString(entry['id']) && isString(entry['projectId']);
}

function collectFromProject(recordingIds: Set<string>, project: unknown): boolean {
  if (project === null || project === undefined) {
    return true;
  }
  if (!isRecord(project)) {
    return false;
  }

  let isValid = true;
  if (project['baseRecordingId'] !== null && project['baseRecordingId'] !== undefined) {
    if (isString(project['baseRecordingId'])) {
      recordingIds.add(project['baseRecordingId']);
    } else {
      isValid = false;
    }
  }
  if (!collectFromProjectSource(recordingIds, project['source'])) {
    isValid = false;
  }
  if (!Array.isArray(project['assets'])) {
    return false;
  }

  for (const asset of project['assets']) {
    if (!isRecord(asset) || !collectFromProjectAssetSource(recordingIds, asset['source'])) {
      isValid = false;
    }
  }

  return isValid;
}

export function collectReferencedRecordingIdReferences(
  args: RecordingReferenceCollectorArgs
): RecordingReferenceCollection {
  const recordingIds = new Set<string>();
  let invalidReferenceCount = 0;

  for (const entry of args.mediaEntries) {
    if (!collectFromMediaEntry(recordingIds, entry)) {
      invalidReferenceCount += 1;
    }
  }

  for (const entry of args.projectExports) {
    if (!collectFromProjectExport(entry)) {
      invalidReferenceCount += 1;
    }
  }

  for (const project of args.projects) {
    if (!collectFromProject(recordingIds, project)) {
      invalidReferenceCount += 1;
    }
  }

  return { invalidReferenceCount, recordingIds };
}

export function collectReferencedRecordingIds(args: RecordingReferenceCollectorArgs): Set<string> {
  const { recordingIds } = collectReferencedRecordingIdReferences(args);
  return recordingIds;
}

export function collectReferencedProjectAssetIds(
  projects: Array<VideoProject | null | undefined>
): Set<string> {
  const assetIds = new Set<string>();

  for (const project of projects) {
    if (!project) {
      continue;
    }
    for (const asset of project.assets) {
      if (asset.source.kind === 'project-asset') {
        assetIds.add(asset.source.projectAssetId);
      }
    }
  }

  return assetIds;
}
