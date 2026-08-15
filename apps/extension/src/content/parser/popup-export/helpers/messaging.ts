import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

export type PopupSendResponse = (response?: {
  assetId?: string;
  error?: string;
  manifest?: WebSnapshotManifest;
  preview?: PopupExportPreview;
  success?: boolean;
  warnings?: string[];
}) => void;
