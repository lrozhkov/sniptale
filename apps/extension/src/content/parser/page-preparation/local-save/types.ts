import type { PreparedSnapshotWarning } from '../snapshot';

export const PagePreparationLocalSaveResultKind = {
  Cancelled: 'cancelled',
  Error: 'error',
  PermissionDenied: 'permission-denied',
  Saved: 'saved',
  Unsupported: 'unsupported',
} as const;

export type PagePreparationLocalSaveResultKind =
  (typeof PagePreparationLocalSaveResultKind)[keyof typeof PagePreparationLocalSaveResultKind];

export interface WritableLocalHtmlFile {
  abort?: () => Promise<void>;
  close: () => Promise<void>;
  write: (data: string) => Promise<void>;
}

export interface WritableLocalHtmlFileHandle {
  createWritable: () => Promise<WritableLocalHtmlFile>;
  name?: string;
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<'denied' | 'granted' | 'prompt'>;
  requestPermission?: (descriptor: {
    mode: 'readwrite';
  }) => Promise<'denied' | 'granted' | 'prompt'>;
}

export interface LocalHtmlFileSystemAccess {
  showSaveFilePicker?: (
    options: LocalHtmlSavePickerOptions
  ) => Promise<WritableLocalHtmlFileHandle>;
}

export interface LocalHtmlSavePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName: string;
  types: Array<{
    accept: Record<string, string[]>;
    description: string;
  }>;
}

export interface LocalHtmlSaveLocation {
  href: string;
  pathname: string;
  protocol: string;
}

export interface SavePreparedLocalHtmlOptions {
  access?: LocalHtmlFileSystemAccess;
  buildSnapshotDocument?: typeof import('../snapshot').buildPreparedSnapshotDocument;
  fileHandle?: WritableLocalHtmlFileHandle | null;
  location?: LocalHtmlSaveLocation;
}

export type SavePreparedLocalHtmlResult =
  | {
      fileHandle: WritableLocalHtmlFileHandle;
      kind: typeof PagePreparationLocalSaveResultKind.Saved;
      warnings: PreparedSnapshotWarning[];
    }
  | {
      kind: Exclude<
        PagePreparationLocalSaveResultKind,
        typeof PagePreparationLocalSaveResultKind.Saved
      >;
      message?: string;
    };
