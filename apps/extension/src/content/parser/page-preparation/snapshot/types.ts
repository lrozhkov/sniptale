export const PreparedSnapshotWarningKind = {
  CanvasUnreadable: 'canvas-unreadable',
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
  preserveAssetUrls?: boolean;
  root?: HTMLElement;
  rootDocument?: Document;
}

export interface PreparedSnapshotDocumentResult {
  document: Document;
  html: string;
  warnings: PreparedSnapshotWarning[];
}
