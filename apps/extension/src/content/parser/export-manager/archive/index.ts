import { blobToDataUrl } from '../../../../platform/media-utils/data-url';
import type {
  ExportData,
  ExportOptions,
  ExportPagePackageEntry,
} from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type {
  ArchiveAsset,
  ExportArchiveBinaryMode,
  ExportArchivePackage,
  ExportArchivePackageEntry,
} from './types';
import { generateMarkdown, updateExportDataWithFilenames } from '../formats/markdown';
import { buildExportArchiveBaseName, createEmptyExportPagePackage } from '../formats/data';
import { sanitizeArchiveEntryFilename } from '../files/download-utils';
import { createExportArchiveBlob } from './generation';
import {
  createArchiveArtifact,
  createCaptureArtifactFromTree,
  createExportArtifact,
  type ArchiveArtifact,
  type ExportArtifact,
} from './artifacts';
export { createExportArchiveBlob, MAX_EXPORT_ARCHIVE_INPUT_BYTES } from './generation';
export type {
  ArchiveAsset,
  ArchiveGenerationControl,
  ExportArchiveBinaryMode,
  ExportArchivePackage,
  ExportArchivePackageEntry,
} from './types';
export type { ArchiveArtifact, CaptureArtifact, ExportArtifact } from './artifacts';

export interface CreateArchiveParams {
  treeData: ParsedDOMTree;
  data: ExportData | null;
  files: Map<string, Blob>;
  errors: string[];
  options: ExportOptions;
  urlUuidToFilename: Map<string, string>;
  previewToDownloadMap: Map<string, string>;
  extraAssets?: ArchiveAsset[];
  binaryMode?: ExportArchiveBinaryMode;
}

function createFilenameMap(
  files: Map<string, Blob>,
  urlUuidToFilename: Map<string, string>,
  previewToDownloadMap: Map<string, string>
): Map<string, string> {
  const filenameMap = new Map<string, string>(urlUuidToFilename);

  files.forEach((_blob, filename) => {
    const uuidMatch = filename.match(/file_\$?([\w]+)|^([\w]{8,})\./);
    const uuid = uuidMatch?.[1] || uuidMatch?.[2];
    if (uuid && !filenameMap.has(uuid)) {
      filenameMap.set(uuid, filename);
    }
  });

  previewToDownloadMap.forEach((downloadUuid, previewUuid) => {
    const filename = filenameMap.get(`file_${downloadUuid}`);
    if (filename) {
      filenameMap.set(`file_${previewUuid}`, filename);
    }
  });

  return filenameMap;
}

function getDataUrlBase64Payload(dataUrl: string): string {
  const marker = ';base64,';
  const markerIndex = dataUrl.lastIndexOf(marker);

  if (markerIndex === -1) {
    throw new Error('Expected a base64 data URL payload for archive asset.');
  }

  return dataUrl.slice(markerIndex + marker.length);
}

async function createBinaryArchiveEntry(path: string, blob: Blob): Promise<ExportPagePackageEntry> {
  const dataUrl = await blobToDataUrl(blob);

  return {
    path,
    binaryBase64: getDataUrlBase64Payload(dataUrl),
    mimeType: blob.type || 'application/octet-stream',
  };
}

function createBlobArchiveEntry(path: string, blob: Blob): ExportArchivePackageEntry {
  return {
    path,
    binaryContent: blob,
    mimeType: blob.type || 'application/octet-stream',
  };
}

async function createArchiveEntry(
  path: string,
  blob: Blob,
  binaryMode: ExportArchiveBinaryMode
): Promise<ExportArchivePackageEntry> {
  if (binaryMode === 'blob') {
    return createBlobArchiveEntry(path, blob);
  }

  return createBinaryArchiveEntry(path, blob);
}

async function appendAssetEntry(
  entries: ExportArchivePackageEntry[],
  path: string,
  content: Blob | string,
  binaryMode: ExportArchiveBinaryMode
): Promise<void> {
  if (typeof content === 'string') {
    entries.push({ path, textContent: content });
    return;
  }

  entries.push(await createArchiveEntry(path, content, binaryMode));
}

async function appendPackageEntries(
  pagePackage: Pick<ExportArchivePackage, 'entries'>,
  artifact: ExportArtifact,
  archiveBaseName: string,
  updatedData: ExportData | null,
  filenameMap: Map<string, string>,
  binaryMode: ExportArchiveBinaryMode
): Promise<void> {
  if (artifact.options.includeJson && updatedData) {
    pagePackage.entries.push({
      path: `${archiveBaseName}.json`,
      textContent: JSON.stringify(updatedData, null, 2),
    });
  }

  if (artifact.options.includeMarkdown) {
    pagePackage.entries.push({
      path: `${archiveBaseName}.md`,
      textContent: generateMarkdown(artifact.capture.treeData, filenameMap),
    });
  }

  for (const [filename, blob] of artifact.files.entries()) {
    const safeFilename = sanitizeArchiveEntryFilename(filename) ?? 'file.bin';
    pagePackage.entries.push(await createArchiveEntry(`files/${safeFilename}`, blob, binaryMode));
  }
}

export async function buildExportPagePackage(artifact: ExportArtifact): Promise<ArchiveArtifact> {
  const binaryMode = artifact.binaryMode;
  const filenameMap = createFilenameMap(
    new Map(artifact.files),
    new Map(artifact.urlUuidToFilename),
    new Map(artifact.previewToDownloadMap)
  );
  const updatedData = updateExportDataWithFilenames(artifact.data, filenameMap);
  const archiveBaseName = buildExportArchiveBaseName(artifact.capture.treeData, updatedData);
  const pagePackage = createEmptyExportPagePackage(archiveBaseName);

  await appendPackageEntries(
    pagePackage,
    artifact,
    archiveBaseName,
    updatedData,
    filenameMap,
    binaryMode
  );

  if (artifact.errors.length > 0) {
    pagePackage.entries.push({
      path: 'logs/errors.log',
      textContent: artifact.errors.join('\n'),
    });
  }

  for (const asset of artifact.extraAssets) {
    await appendAssetEntry(pagePackage.entries, asset.path, asset.content, binaryMode);
  }

  return createArchiveArtifact({
    archiveBaseName,
    entries: pagePackage.entries,
    errors: [],
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  });
}

export async function createExportArchive(
  params: CreateArchiveParams
): Promise<{ blob: Blob; filename: string }> {
  const pagePackage = await buildExportPagePackage(
    createExportArtifact({
      binaryMode: 'blob',
      capture: createCaptureArtifactFromTree(params.treeData),
      data: params.data,
      errors: params.errors,
      extraAssets: params.extraAssets ?? [],
      files: params.files,
      options: params.options,
      previewToDownloadMap: params.previewToDownloadMap,
      urlUuidToFilename: params.urlUuidToFilename,
    })
  );
  const blob = await createExportArchiveBlob(pagePackage);
  const filename = `${pagePackage.archiveBaseName}.zip`;

  return { blob, filename };
}
