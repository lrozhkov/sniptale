import type { Logger } from '@sniptale/platform/observability/logger/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { resolveCaptureSource } from './preflight';
import {
  ensureOffscreenDocumentReady,
  enableAnnotationsIfNeeded,
  resolveCaptureSource as resolveCaptureSourceImpl,
} from './preflight';
import { cleanupViewportEmulation, configureViewportEmulation } from './viewport';
import { notifyRecordingStartFailed } from '../runtime/manager';
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

export type ViewportSetupDeps = {
  configureViewportEmulation: typeof configureViewportEmulation;
  cleanupViewportEmulation: typeof cleanupViewportEmulation;
  abortStart: typeof abortVideoRecordingStartIfCancelled;
  notifyStartFailed: typeof notifyRecordingStartFailed;
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

export const defaultViewportSetupDeps: ViewportSetupDeps = {
  abortStart: abortVideoRecordingStartIfCancelled,
  cleanupViewportEmulation,
  configureViewportEmulation,
  notifyStartFailed: notifyRecordingStartFailed,
};

export const announceCaptureSourceLogger = createLogger({
  namespace: 'BackgroundVideoFlowTransport:AnnounceCaptureSource',
});
