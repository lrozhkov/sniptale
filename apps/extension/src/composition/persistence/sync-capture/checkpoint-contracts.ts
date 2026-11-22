const CAPTURE_ROOT_KINDS = [
  'media',
  'image-project',
  'video-project',
  'video-review',
  'scenario-project',
] as const;
export type CaptureRootKind = (typeof CAPTURE_ROOT_KINDS)[number];

export function isCaptureRootKind(value: unknown): value is CaptureRootKind {
  return CAPTURE_ROOT_KINDS.some((kind) => kind === value);
}

/** Transient acknowledgement of one pending revision minted by an accepted native save. */
export interface SyncCheckpointReceipt {
  rootKind: CaptureRootKind;
  rootId: string;
  revision: string;
}

/** One device policy shared by every editor; labels belong to the UI. */
export const SYNC_CHECKPOINT_INTERVALS = [0, 60000, 300000, 900000, 1800000, 3600000] as const;
export type SyncCheckpointInterval = (typeof SYNC_CHECKPOINT_INTERVALS)[number];
export const DEFAULT_SYNC_CHECKPOINT_INTERVAL: SyncCheckpointInterval = 300000;
