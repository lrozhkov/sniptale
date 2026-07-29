import type { Logger } from '@sniptale/platform/observability/logger/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { resolveCaptureSource } from './preflight';
import {
  ensureOffscreenDocumentReady,
  enableAnnotationsIfNeeded,
  resolveCaptureSource as resolveCaptureSourceImpl,
} from './preflight';
import { abortVideoRecordingStartIfCancelled } from './flow-cancellation';

export type CaptureSourceResolverDeps = {
  logger: Pick<Logger, 'debug' | 'log'>;
  resolveCaptureSource: typeof resolveCaptureSource;
};

export type OffscreenSetupDeps = {
  logger: Pick<Logger, 'debug' | 'log'>;
  ensureOffscreenDocumentReady: typeof ensureOffscreenDocumentReady;
  abortStart: typeof abortVideoRecordingStartIfCancelled;
};

export type AnnotationSetupDeps = {
  enableAnnotationsIfNeeded: typeof enableAnnotationsIfNeeded;
  abortStart: typeof abortVideoRecordingStartIfCancelled;
};

export const defaultCaptureSourceResolverDeps: CaptureSourceResolverDeps = {
  logger: createLogger({ namespace: 'BackgroundVideoFlowTransport:CaptureSource' }),
  resolveCaptureSource: resolveCaptureSourceImpl,
};

export const defaultOffscreenSetupDeps: OffscreenSetupDeps = {
  abortStart: abortVideoRecordingStartIfCancelled,
  ensureOffscreenDocumentReady,
  logger: createLogger({ namespace: 'BackgroundVideoFlowTransport:Offscreen' }),
};

export const defaultAnnotationSetupDeps: AnnotationSetupDeps = {
  abortStart: abortVideoRecordingStartIfCancelled,
  enableAnnotationsIfNeeded,
};

export const announceCaptureSourceLogger = createLogger({
  namespace: 'BackgroundVideoFlowTransport:AnnounceCaptureSource',
});
