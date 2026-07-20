export const PreparedSnapshotWarningKind = {
  IframeTimeout: 'iframe-timeout',
  IframeUnreadable: 'iframe-unreadable',
  SanitizerDrop: 'sanitizer-drop',
} as const;

export type PreparedSnapshotWarningKind =
  (typeof PreparedSnapshotWarningKind)[keyof typeof PreparedSnapshotWarningKind];

export interface PreparedSnapshotWarning {
  kind: PreparedSnapshotWarningKind;
  message: string;
  target?: string;
}

export interface BuildPreparedSnapshotDocumentOptions {
  contextLabel?: string;
  iframeTimeoutMs?: number;
  root?: HTMLElement;
  rootDocument?: Document;
}

export interface PreparedSnapshotDocumentResult {
  document: Document;
  html: string;
  warnings: PreparedSnapshotWarning[];
}
