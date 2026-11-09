import type { AssetRef } from '../assets/contracts';

export interface FramedHistoryTotals {
  streamSha256: string;
  totalBytes: number;
  totalBlocks: number;
}

/** Checks the immutable reference against the exact framed history bytes. */
export function isHistorySnapshotRef(
  ref: AssetRef | null,
  totals: FramedHistoryTotals
): ref is AssetRef {
  return (
    ref !== null &&
    ref.mimeType === 'application/octet-stream' &&
    ref.sha256 === totals.streamSha256 &&
    ref.size === totals.totalBytes + totals.totalBlocks * 4
  );
}
