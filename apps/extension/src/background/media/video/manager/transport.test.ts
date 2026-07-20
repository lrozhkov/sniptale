import { expect, it } from 'vitest';

import { announceCaptureSource } from './transport.announce';
import {
  enableAnnotationsOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
  resolveCaptureSourceForMode,
} from './transport.resolve';
import { finalizeRecordingStart } from './transport.finalize';
import { buildViewportEmulationResult } from './transport.viewport';
import {
  announceCaptureSource as announceCaptureSourceFromFacade,
  buildViewportEmulationResult as buildViewportEmulationResultFromFacade,
  enableAnnotationsOrAbort as enableAnnotationsOrAbortFromFacade,
  ensureOffscreenDocumentReadyOrAbort as ensureOffscreenDocumentReadyOrAbortFromFacade,
  finalizeRecordingStart as finalizeRecordingStartFromFacade,
  resolveCaptureSourceForMode as resolveCaptureSourceForModeFromFacade,
} from './transport';

it('re-exports the transport helpers from their owner-local seams without wrapping them', () => {
  expect(announceCaptureSourceFromFacade).toBe(announceCaptureSource);
  expect(buildViewportEmulationResultFromFacade).toBe(buildViewportEmulationResult);
  expect(enableAnnotationsOrAbortFromFacade).toBe(enableAnnotationsOrAbort);
  expect(ensureOffscreenDocumentReadyOrAbortFromFacade).toBe(ensureOffscreenDocumentReadyOrAbort);
  expect(finalizeRecordingStartFromFacade).toBe(finalizeRecordingStart);
  expect(resolveCaptureSourceForModeFromFacade).toBe(resolveCaptureSourceForMode);
});
