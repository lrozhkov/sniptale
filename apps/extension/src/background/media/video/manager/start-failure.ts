import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import type { VideoRecordingStartFailureCode } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { CaptureSurfaceError } from '../../../capture-surface/types';

export class VideoRecordingStartFailure extends Error {
  constructor(readonly code: VideoRecordingStartFailureCode) {
    super(code);
    this.name = 'VideoRecordingStartFailure';
  }
}

export function classifyTabCaptureFailure(error: unknown): VideoRecordingStartFailureCode {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (message.includes('Extension has not been invoked for the current page')) {
    return 'permission-required';
  }
  if (message.includes('Cannot capture') || message.includes('No tab capture stream id')) {
    return 'invalid-source';
  }
  return 'internal-error';
}

export function classifyCaptureSurfaceStartFailure(
  error: unknown
): VideoRecordingStartFailureCode | undefined {
  if (!(error instanceof CaptureSurfaceError)) return undefined;
  if (error.code === 'window-too-large') return 'viewport-too-large';
  if (error.code === 'verification-failed') return 'viewport-verification-failed';
  if (error.code === 'permission-denied') return 'permission-required';
  if (error.code === 'surface-busy') return 'already-active';
  return undefined;
}

export async function ensureCurrentRecordingDocument(
  tabId: number,
  documentId: string
): Promise<void> {
  const frames = await browserWebNavigation.getAllFrames({ tabId });
  if (!frames?.some((frame) => frame.frameId === 0 && frame.documentId === documentId)) {
    throw new VideoRecordingStartFailure('stale-context');
  }
}
