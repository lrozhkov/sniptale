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

function collectFromMediaSource(recordingIds: Set<string>, source: unknown): boolean {
  if (!isRecord(source) || !isString(source['kind'])) {
    return false;
  }
  if (source['kind'] === 'recording' || source['kind'] === 'project-export') {
    if (!isString(source['recordingId'])) {
      return false;
    }
    recordingIds.add(source['recordingId']);
    return true;
  }
  if (source['kind'] === 'screenshot') {
    return true;
  }
  if (source['kind'] === 'project-asset') {
    return isString(source['projectAssetId']);
  }
  if (source['kind'] === 'web-snapshot') {
    return isString(source['snapshotId']);
  }
  return false;
}

function collectFromProjectSource(recordingIds: Set<string>, source: unknown): boolean {
  if (!isRecord(source) || !isString(source['kind'])) {
    return false;
  }
  if (source['kind'] === 'recording') {
    if (!isString(source['recordingId'])) {
      return false;
    }
    recordingIds.add(source['recordingId']);
    return true;
  }
  if (source['kind'] === 'manual') {
    return true;
  }
  if (source['kind'] === 'scenario') {
    return isString(source['scenarioProjectId']);
  }
  return false;
}

function collectFromProjectAssetSource(recordingIds: Set<string>, source: unknown): boolean {
  if (!isRecord(source) || !isString(source['kind'])) {
    return false;
  }
  if (source['kind'] === 'recording') {
    if (!isString(source['recordingId'])) {
      return false;
    }
    recordingIds.add(source['recordingId']);
    return true;
  }
  if (source['kind'] === 'project-asset') {
    const isValid = isString(source['projectAssetId']);
    if (source['originRecordingId'] !== undefined) {
      if (!isString(source['originRecordingId'])) {
        return false;
      }
      recordingIds.add(source['originRecordingId']);
    }
    return isValid;
  }
  if (source['kind'] === 'scenario-asset') {
    return isString(source['scenarioAssetId']);
  }
  return false;
}

function collectFromMediaEntry(recordingIds: Set<string>, entry: unknown): boolean {
  return isRecord(entry) && collectFromMediaSource(recordingIds, entry['source']);
}

function collectFromProjectExport(recordingIds: Set<string>, entry: unknown): boolean {
  if (!isRecord(entry) || !isString(entry['recordingId'])) {
    return false;
  }
  recordingIds.add(entry['recordingId']);
  return true;
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
    if (!collectFromProjectExport(recordingIds, entry)) {
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
