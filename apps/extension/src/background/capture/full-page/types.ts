import type {
  FullPageCaptureBackendKind,
  FullPageCaptureMetadata,
  FullPageCapturePreferences,
} from '../../../contracts/full-page-capture';
import type { FullPageQualityPolicy } from '../../../contracts/full-page-capture';

export type FullPageCaptureOptions = {
  abortSignal?: AbortSignal;
  backendKind?: FullPageCaptureBackendKind;
  documentId?: string;
  exportRunId?: string;
  format?: 'png' | 'jpeg' | 'webp';
  preferences?: FullPageCapturePreferences;
  qualityPolicy?: FullPageQualityPolicy;
  quality?: number;
};

export type FullPageCaptureTransaction = {
  dataUrl: string;
  jobId: string;
  metadata: FullPageCaptureMetadata;
};
