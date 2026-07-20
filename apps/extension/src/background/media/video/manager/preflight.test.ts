import { expect, it } from 'vitest';

import { enableAnnotationsIfNeeded } from './preflight.annotations';
import { ensureOffscreenDocumentReady } from './preflight.offscreen';
import { resolveCaptureSource } from './preflight.resolve';
import {
  enableAnnotationsIfNeeded as enableAnnotationsIfNeededFromFacade,
  ensureOffscreenDocumentReady as ensureOffscreenDocumentReadyFromFacade,
  resolveCaptureSource as resolveCaptureSourceFromFacade,
} from './preflight';

it('re-exports the preflight helpers from their owner-local seams without wrapping them', () => {
  expect(enableAnnotationsIfNeededFromFacade).toBe(enableAnnotationsIfNeeded);
  expect(ensureOffscreenDocumentReadyFromFacade).toBe(ensureOffscreenDocumentReady);
  expect(resolveCaptureSourceFromFacade).toBe(resolveCaptureSource);
});
