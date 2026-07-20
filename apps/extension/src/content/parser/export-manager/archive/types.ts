import type { ExportPagePackage, ExportPagePackageEntry } from '@sniptale/runtime-contracts/export';

export type ExportArchiveBinaryMode = 'base64' | 'blob';

export type ExportArchivePackageEntry = ExportPagePackageEntry & {
  binaryContent?: Blob;
};

export type ExportArchivePackage = Omit<ExportPagePackage, 'entries'> & {
  entries: ExportArchivePackageEntry[];
};

export interface ArchiveAsset {
  path: string;
  content: Blob | string;
}

export interface ArchiveGenerationControl {
  createCancelledError: () => Error;
  isCancelled: () => boolean;
}
