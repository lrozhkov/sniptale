import { getMediaThumbnail, listMediaLibrary } from '../media-library';
import { listEditorSessionDrafts } from '../editor-sessions';
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

export async function getLibraryStorageUsage(): Promise<LibraryStorageUsage> {
  const [media, videoProjects, scenarioProjects, editorSessions] = await Promise.all([
    listMediaLibrary(),
    listVideoProjectEntries(),
    listScenarioProjectEntries(),
    listEditorSessionDrafts(),
  ]);
  const usage: LibraryStorageUsage = { draftsBytes: 0, libraryBytes: 0, totalBytes: 0 };
  const addBytes = (size: number, storageClass: 'temporary' | 'library') => {
    const safeSize = Math.max(0, size);
    usage.totalBytes += safeSize;
    if (storageClass === 'temporary') usage.draftsBytes += safeSize;
    else usage.libraryBytes += safeSize;
  };
  const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

  for (const entry of media) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(entry.size, storageClass);
    if (entry.hasThumbnail) {
      const thumbnail = await getMediaThumbnail(entry.id);
      if (thumbnail) addBytes(thumbnail.blob.size, storageClass);
    }
  }
  for (const entry of videoProjects) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(jsonBytes(entry.project), storageClass);
    const projectThumbnail = await getMediaThumbnail(`video-project:${entry.id}`);
    if (projectThumbnail) addBytes(projectThumbnail.blob.size, storageClass);
  }
  for (const entry of editorSessions) {
    addBytes(jsonBytes(entry), entry.lifecycle?.storageClass ?? 'library');
  }
  for (const entry of scenarioProjects) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(jsonBytes(entry.project), storageClass);
    const [assets, exports, stepDocuments, projectThumbnail] = await Promise.all([
      listScenarioAssets(entry.id),
      listScenarioExports(entry.id),
      listScenarioStepEditorDocuments(entry.id),
      getMediaThumbnail(`scenario:${entry.id}`),
    ]);
    for (const asset of assets) addBytes(asset.size, storageClass);
    for (const stepDocument of stepDocuments) addBytes(jsonBytes(stepDocument), storageClass);
    if (projectThumbnail) addBytes(projectThumbnail.blob.size, storageClass);
    for (const scenarioExport of exports) {
      addBytes(scenarioExport.size, storageClass);
      const exportThumbnail = await getMediaThumbnail(`scenario-export:${scenarioExport.id}`);
      if (exportThumbnail) addBytes(exportThumbnail.blob.size, storageClass);
    }
  }
  return usage;
}
