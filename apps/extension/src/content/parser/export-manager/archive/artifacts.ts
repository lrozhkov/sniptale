import type { ExportData, ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { PreparedDOMTreeSnapshot } from '../../dom-tree-parser/snapshot';
import { sanitizeArchiveEntryFilename } from '../files/download-utils';
import { MAX_EXPORT_ARCHIVE_INPUT_BYTES } from './budget';
import type { ArchiveAsset, ExportArchivePackage, ExportArchivePackageEntry } from './types';

const EXPORT_ARTIFACT_BRAND: unique symbol = Symbol('ExportArtifact');
const ARCHIVE_ARTIFACT_BRAND: unique symbol = Symbol('ArchiveArtifact');
const CAPTURE_ARTIFACT_BRAND: unique symbol = Symbol('CaptureArtifact');

export type CaptureArtifact = {
  readonly [CAPTURE_ARTIFACT_BRAND]: true;
  readonly snapshot: PreparedDOMTreeSnapshot;
  readonly treeData: ParsedDOMTree;
};

export type ExportArtifact = {
  readonly [EXPORT_ARTIFACT_BRAND]: true;
  readonly binaryMode: 'base64' | 'blob';
  readonly capture: CaptureArtifact;
  readonly data: ExportData | null;
  readonly errors: readonly string[];
  readonly extraAssets: readonly ArchiveAsset[];
  readonly files: ReadonlyMap<string, Blob>;
  readonly options: ExportOptions;
  readonly previewToDownloadMap: ReadonlyMap<string, string>;
  readonly urlUuidToFilename: ReadonlyMap<string, string>;
};

export type ArchiveArtifact = ExportArchivePackage & {
  readonly [ARCHIVE_ARTIFACT_BRAND]: true;
};

type CreateExportArtifactArgs = Omit<ExportArtifact, typeof EXPORT_ARTIFACT_BRAND>;

function getTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getBlobSize(value: Blob): number {
  return value.size;
}

function assertArchivePath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error(`Unsafe export archive path: ${path}`);
  }

  for (const part of path.split('/')) {
    if (!part || part === '.' || part === '..' || !sanitizeArchiveEntryFilename(part)) {
      throw new Error(`Unsafe export archive path: ${path}`);
    }
  }
}

function assertBlobBudget(blob: Blob): void {
  if (getBlobSize(blob) > MAX_EXPORT_ARCHIVE_INPUT_BYTES) {
    throw new Error('Export artifact blob is too large');
  }
}

function assertTextBudget(value: string): void {
  if (getTextByteLength(value) > MAX_EXPORT_ARCHIVE_INPUT_BYTES) {
    throw new Error('Export artifact text is too large');
  }
}

function assertArchiveAsset(asset: ArchiveAsset): void {
  assertArchivePath(asset.path);
  if (typeof asset.content === 'string') {
    assertTextBudget(asset.content);
    return;
  }
  assertBlobBudget(asset.content);
}

function assertArchiveEntry(entry: ExportArchivePackageEntry): void {
  assertArchivePath(entry.path);
  if (entry.binaryContent instanceof Blob) {
    assertBlobBudget(entry.binaryContent);
  }
  if (typeof entry.textContent === 'string') {
    assertTextBudget(entry.textContent);
  }
  if (typeof entry.binaryBase64 === 'string') {
    assertTextBudget(entry.binaryBase64);
  }
}

function sanitizeExportArtifactFilename(filename: string): string {
  const safeFilename = sanitizeArchiveEntryFilename(filename);
  if (!safeFilename) {
    throw new Error(`Unsafe export file name: ${filename}`);
  }
  return safeFilename;
}

function createValidatedFileMap(files: ReadonlyMap<string, Blob>): ReadonlyMap<string, Blob> {
  const validatedFiles = new Map<string, Blob>();

  for (const [filename, blob] of files.entries()) {
    const safeFilename = sanitizeExportArtifactFilename(filename);
    assertBlobBudget(blob);
    validatedFiles.set(safeFilename, blob);
  }

  return validatedFiles;
}

function createValidatedFilenameMap(
  filenameMap: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const validatedFilenameMap = new Map<string, string>();

  for (const [uuid, filename] of filenameMap.entries()) {
    validatedFilenameMap.set(uuid, sanitizeExportArtifactFilename(filename));
  }

  return validatedFilenameMap;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }
  return false;
}

function assertBindingId(value: string): void {
  if (
    !value ||
    value.length > 200 ||
    hasAsciiControlCharacter(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`Unsafe export artifact binding id: ${value}`);
  }
}

function createValidatedBindingMap(
  bindingMap: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const validatedBindingMap = new Map<string, string>();

  for (const [previewUuid, downloadUuid] of bindingMap.entries()) {
    assertBindingId(previewUuid);
    assertBindingId(downloadUuid);
    validatedBindingMap.set(previewUuid, downloadUuid);
  }

  return validatedBindingMap;
}

export function createCaptureArtifact(snapshot: PreparedDOMTreeSnapshot): CaptureArtifact {
  if (!snapshot.tree || !Array.isArray(snapshot.tree.structure)) {
    throw new Error('Invalid export capture artifact');
  }
  return {
    [CAPTURE_ARTIFACT_BRAND]: true,
    snapshot,
    treeData: snapshot.tree,
  };
}

export function createCaptureArtifactFromTree(treeData: ParsedDOMTree): CaptureArtifact {
  return createCaptureArtifact({
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    tree: treeData,
  });
}

export function createExportArtifact(args: CreateExportArtifactArgs): ExportArtifact {
  const files = createValidatedFileMap(args.files);
  const urlUuidToFilename = createValidatedFilenameMap(args.urlUuidToFilename);
  const previewToDownloadMap = createValidatedBindingMap(args.previewToDownloadMap);

  for (const asset of args.extraAssets) {
    assertArchiveAsset(asset);
  }

  return {
    ...args,
    files,
    previewToDownloadMap,
    urlUuidToFilename,
    [EXPORT_ARTIFACT_BRAND]: true,
  } satisfies ExportArtifact;
}

export function createArchiveArtifact(archivePackage: ExportArchivePackage): ArchiveArtifact {
  for (const entry of archivePackage.entries) {
    assertArchiveEntry(entry);
  }
  return {
    ...archivePackage,
    [ARCHIVE_ARTIFACT_BRAND]: true,
  };
}
