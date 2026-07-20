import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';

function createRecordingMediaId(recordingId: string): string {
  return `recording:${recordingId}`;
}

function createProjectExportMediaId(exportId: string): string {
  return `export:${exportId}`;
}

function createProjectAssetMediaId(projectAssetId: string): string {
  return `project-asset:${projectAssetId}`;
}

function remapScreenshot(entry: Omit<MediaLibraryEntry, 'blob'>): Omit<MediaLibraryEntry, 'blob'> {
  return { ...entry, id: crypto.randomUUID() };
}

function remapRecording(entry: Omit<MediaLibraryEntry, 'blob'>): Omit<MediaLibraryEntry, 'blob'> {
  const recordingId = `import-${crypto.randomUUID()}`;
  return {
    ...entry,
    id: createRecordingMediaId(recordingId),
    source: {
      kind: 'recording',
      recordingId,
    },
  };
}

function remapProjectExport(
  entry: Omit<MediaLibraryEntry, 'blob'>
): Omit<MediaLibraryEntry, 'blob'> {
  if (entry.source.kind !== 'project-export') {
    return entry;
  }

  const recordingId = `import-${crypto.randomUUID()}`;
  const exportId = crypto.randomUUID();
  return {
    ...entry,
    id: createProjectExportMediaId(exportId),
    source: {
      exportId,
      kind: 'project-export',
      projectId: entry.source.projectId,
      recordingId,
    },
  };
}

function remapWebSnapshot(entry: Omit<MediaLibraryEntry, 'blob'>): Omit<MediaLibraryEntry, 'blob'> {
  const snapshotId = crypto.randomUUID();
  return {
    ...entry,
    id: snapshotId,
    source: {
      kind: 'web-snapshot',
      snapshotId,
    },
  };
}

function remapProjectAsset(
  entry: Omit<MediaLibraryEntry, 'blob'>
): Omit<MediaLibraryEntry, 'blob'> {
  const projectAssetId = `import-${crypto.randomUUID()}`;
  return {
    ...entry,
    id: createProjectAssetMediaId(projectAssetId),
    source: {
      kind: 'project-asset',
      projectAssetId,
    },
  };
}

export function remapEntryForDuplicate(
  entry: Omit<MediaLibraryEntry, 'blob'>
): Omit<MediaLibraryEntry, 'blob'> {
  if (entry.source.kind === 'screenshot') {
    return remapScreenshot(entry);
  }

  if (entry.source.kind === 'recording') {
    return remapRecording(entry);
  }

  if (entry.source.kind === 'project-export') {
    return remapProjectExport(entry);
  }

  if (entry.source.kind === 'web-snapshot') {
    return remapWebSnapshot(entry);
  }

  return remapProjectAsset(entry);
}
