import { listAggregatePresentations } from '../aggregate-presentations';
import { listImageWorkspaces } from '../image-workspaces';
import { getMediaThumbnail, listMediaLibrary } from '../media-library';
import { listVideoProjectEntries } from '../projects';
import {
  listScenarioAssets,
  listScenarioExports,
  listScenarioProjectEntries,
} from '../scenario/projects';
import { listScenarioStepEditorDocuments } from '../scenario/editor-documents';

export interface LibraryStorageUsage {
  draftsBytes: number;
  libraryBytes: number;
  totalBytes: number;
}

type StorageClass = 'temporary' | 'library';

export async function getLibraryStorageUsage(): Promise<LibraryStorageUsage> {
  const [media, videoProjects, scenarioProjects, imageWorkspaces, presentations] =
    await Promise.all([
      listMediaLibrary(),
      listVideoProjectEntries(),
      listScenarioProjectEntries(),
      listImageWorkspaces(),
      listAggregatePresentations(),
    ]);
  const usage: LibraryStorageUsage = { draftsBytes: 0, libraryBytes: 0, totalBytes: 0 };
  const addBytes = (size: number, storageClass: StorageClass) => {
    const safeSize = Math.max(0, size);
    usage.totalBytes += safeSize;
    if (storageClass === 'temporary') usage.draftsBytes += safeSize;
    else usage.libraryBytes += safeSize;
  };
  const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const mediaById = new Map(media.map((entry) => [entry.id, entry]));
  const videoById = new Map(videoProjects.map((entry) => [entry.id, entry]));
  const scenarioById = new Map(scenarioProjects.map((entry) => [entry.id, entry]));

  for (const entry of media) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(entry.size, storageClass);
    if (entry.hasThumbnail) {
      const thumbnail = await getMediaThumbnail(entry.id);
      if (thumbnail) addBytes(thumbnail.blob.size, storageClass);
    }
  }
  for (const workspace of imageWorkspaces) {
    const parent = mediaById.get(workspace.aggregateId);
    if (parent) {
      addBytes(jsonBytes(workspace), parent.lifecycle?.storageClass ?? 'library');
    }
  }
  for (const entry of videoProjects) {
    addBytes(jsonBytes(entry.project), entry.lifecycle?.storageClass ?? 'library');
    const legacyThumbnail = await getMediaThumbnail(`video-project:${entry.id}`);
    if (legacyThumbnail) {
      addBytes(legacyThumbnail.blob.size, entry.lifecycle?.storageClass ?? 'library');
    }
  }
  for (const entry of scenarioProjects) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(jsonBytes(entry.project), storageClass);
    const [assets, exports, stepDocuments, legacyThumbnail] = await Promise.all([
      listScenarioAssets(entry.id),
      listScenarioExports(entry.id),
      listScenarioStepEditorDocuments(entry.id),
      getMediaThumbnail(`scenario:${entry.id}`),
    ]);
    for (const asset of assets) addBytes(asset.size, storageClass);
    for (const stepDocument of stepDocuments) addBytes(jsonBytes(stepDocument), storageClass);
    if (legacyThumbnail) addBytes(legacyThumbnail.blob.size, storageClass);
    for (const scenarioExport of exports) {
      addBytes(scenarioExport.size, storageClass);
      const exportThumbnail = await getMediaThumbnail(`scenario-export:${scenarioExport.id}`);
      if (exportThumbnail) addBytes(exportThumbnail.blob.size, storageClass);
    }
  }
  for (const presentation of presentations) {
    const storageClass = resolvePresentationStorageClass(presentation, {
      mediaById,
      scenarioById,
      videoById,
    });
    if (!storageClass) continue;
    addBytes(presentation.thumbnailBlob.size, storageClass);
    if (presentation.previewBlob) addBytes(presentation.previewBlob.size, storageClass);
  }
  return usage;
}

function resolvePresentationStorageClass(
  presentation: Awaited<ReturnType<typeof listAggregatePresentations>>[number],
  roots: {
    mediaById: Map<string, Awaited<ReturnType<typeof listMediaLibrary>>[number]>;
    scenarioById: Map<string, Awaited<ReturnType<typeof listScenarioProjectEntries>>[number]>;
    videoById: Map<string, Awaited<ReturnType<typeof listVideoProjectEntries>>[number]>;
  }
): StorageClass | null {
  const root =
    presentation.aggregateKind === 'image'
      ? roots.mediaById.get(presentation.aggregateId)
      : presentation.aggregateKind === 'scenario'
        ? roots.scenarioById.get(presentation.aggregateId)
        : roots.videoById.get(presentation.aggregateId);
  return root ? (root.lifecycle?.storageClass ?? 'library') : null;
}
