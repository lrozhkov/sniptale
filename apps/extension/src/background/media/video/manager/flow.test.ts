import { expect, it } from 'vitest';

import {
  announceCaptureSource,
  buildViewportEmulationResult,
  enableAnnotationsOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
  finalizeRecordingStart,
  resolveCaptureSourceForMode,
} from './transport';
import {
  abortVideoRecordingStartIfCancelled,
  isVideoRecordingStartCancelled,
} from './flow-cancellation';
import {
  handleIncompleteVideoRecordingCountdown,
  runVideoRecordingCountdown,
} from './flow-countdown';
import {
  abortIfCancelled,
  announceCaptureSource as announceCaptureSourceFromFacade,
  buildViewportEmulationResult as buildViewportEmulationResultFromFacade,
  enableAnnotationsOrAbort as enableAnnotationsOrAbortFromFacade,
  ensureOffscreenDocumentReadyOrAbort as ensureOffscreenDocumentReadyOrAbortFromFacade,
  finalizeRecordingStart as finalizeRecordingStartFromFacade,
  handleIncompleteCountdown,
  isStartCancelled,
  resolveCaptureSourceForMode as resolveCaptureSourceForModeFromFacade,
  runCountdown,
} from './flow';

it('re-exports the flow helpers from their ownership seams without wrapping them', () => {
  expect(announceCaptureSourceFromFacade).toBe(announceCaptureSource);
  expect(buildViewportEmulationResultFromFacade).toBe(buildViewportEmulationResult);
  expect(enableAnnotationsOrAbortFromFacade).toBe(enableAnnotationsOrAbort);
  expect(ensureOffscreenDocumentReadyOrAbortFromFacade).toBe(ensureOffscreenDocumentReadyOrAbort);
  expect(finalizeRecordingStartFromFacade).toBe(finalizeRecordingStart);
  expect(resolveCaptureSourceForModeFromFacade).toBe(resolveCaptureSourceForMode);
  expect(abortIfCancelled).toBe(abortVideoRecordingStartIfCancelled);
  expect(isStartCancelled).toBe(isVideoRecordingStartCancelled);
  expect(handleIncompleteCountdown).toBe(handleIncompleteVideoRecordingCountdown);
  expect(runCountdown).toBe(runVideoRecordingCountdown);
});
