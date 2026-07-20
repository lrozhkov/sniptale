export interface ZipCentralDirectoryEntry {
  compressedSize: number;
  compressionMethod: 0 | 8;
  crc32: number;
  dataEndOffset: number;
  dataStartOffset: number;
  directory: boolean;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
}

export interface ZipCentralDirectoryProfile {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entries: ZipCentralDirectoryEntry[];
  regularFileCount: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
  zip64: boolean;
}

export interface InspectZipCentralDirectoryOptions {
  assertPath?: (path: string) => void;
  maxArchiveBytes: number;
  maxCompressionRatio: number;
  maxEntryBytes: number;
  maxFileCount: number;
  maxTotalInflatedBytes: number;
}
