import { expect, it } from 'vitest';

import { announceCaptureSource } from './transport.announce';
import {
  prepareContentSurfaceOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
  resolveCaptureSourceForMode,
} from './transport.resolve';
import { finalizeRecordingStart } from './transport.finalize';
import {
  announceCaptureSource as announceCaptureSourceFromFacade,
  prepareContentSurfaceOrAbort as prepareContentSurfaceOrAbortFromFacade,
  ensureOffscreenDocumentReadyOrAbort as ensureOffscreenDocumentReadyOrAbortFromFacade,
  finalizeRecordingStart as finalizeRecordingStartFromFacade,
  resolveCaptureSourceForMode as resolveCaptureSourceForModeFromFacade,
} from './transport';

it('re-exports the transport helpers from their owner-local seams without wrapping them', () => {
  expect(announceCaptureSourceFromFacade).toBe(announceCaptureSource);
  expect(prepareContentSurfaceOrAbortFromFacade).toBe(prepareContentSurfaceOrAbort);
  expect(ensureOffscreenDocumentReadyOrAbortFromFacade).toBe(ensureOffscreenDocumentReadyOrAbort);
  expect(finalizeRecordingStartFromFacade).toBe(finalizeRecordingStart);
  expect(resolveCaptureSourceForModeFromFacade).toBe(resolveCaptureSourceForMode);
});
