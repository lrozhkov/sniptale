export const MAX_MEDIA_ARCHIVE_BYTES = 16 * 1024 * 1024 * 1024;
export const MAX_MEDIA_ARCHIVE_ENTRIES = 25_000;
export const MAX_MEDIA_ARCHIVE_INFLATED_BYTES = 64 * 1024 * 1024 * 1024;
export const MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES = 16 * 1024 * 1024;
export const MAX_MEDIA_ARCHIVE_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;

export interface ArchiveObjectRef {
  objectId: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ArchiveRootDescriptorBase {
  rootId: string;
  metadataPath: string;
  objectCount: number;
  totalBytes: number;
}

export type ArchiveRootDescriptor =
  | (ArchiveRootDescriptorBase & {
      rootKind: 'media';
      mediaSubtype: 'library-item' | 'effect-bundle';
    })
  | (ArchiveRootDescriptorBase & {
      rootKind: 'video-project' | 'scenario-project';
    });

export interface ArchiveTransferProgress {
  bytesRead: number;
  bytesWritten: number;
  currentFilename: string | null;
  rootsComplete: number;
}

export interface ExportSink {
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface ArchiveEntryInfo {
  compressedSize: number;
  crc32: number;
  directory: boolean;
  path: string;
  size: number;
}

export interface ArchiveEntrySource extends ArchiveEntryInfo {
  pipeTo(writable: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
  text(maxBytes?: number): Promise<string>;
}

export interface ArchiveReader {
  entries(): readonly ArchiveEntryInfo[];
  entry(path: string): ArchiveEntrySource | null;
  close(): Promise<void>;
}

export interface ArchiveWriter {
  addBlob(
    path: string,
    blob: Blob,
    options?: { compress?: boolean; signal?: AbortSignal }
  ): Promise<void>;
  addSource(
    path: string,
    source: ArchiveEntrySource,
    options?: { compress?: boolean; signal?: AbortSignal }
  ): Promise<void>;
  addText(path: string, text: string, options?: { signal?: AbortSignal }): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
