import type {
  FullPageCaptureBackendKind,
  FullPageCaptureMetadata,
  FullPageCapturePreferences,
} from '../../../contracts/full-page-capture';

export interface CaptureScreenshotResult {
  data: string;
}

export type FullPageCaptureOptions = {
  abortSignal?: AbortSignal;
  backendKind?: FullPageCaptureBackendKind;
  documentId?: string;
  exportRunId?: string;
  format?: 'png' | 'jpeg' | 'webp';
  preferences?: FullPageCapturePreferences;
  quality?: number;
};

export type FullPageCaptureTransaction = {
  dataUrl: string;
  jobId: string;
  metadata: FullPageCaptureMetadata;
};
