import { expect, it } from 'vitest';

import { prepareContentSurfaceIfNeeded } from './preflight.content-surface';
import { ensureOffscreenDocumentReady } from './preflight.offscreen';
import { resolveCaptureSource } from './preflight.resolve';
import {
  prepareContentSurfaceIfNeeded as prepareContentSurfaceIfNeededFromFacade,
  ensureOffscreenDocumentReady as ensureOffscreenDocumentReadyFromFacade,
  resolveCaptureSource as resolveCaptureSourceFromFacade,
} from './preflight';

it('re-exports the preflight helpers from their owner-local seams without wrapping them', () => {
  expect(prepareContentSurfaceIfNeededFromFacade).toBe(prepareContentSurfaceIfNeeded);
  expect(ensureOffscreenDocumentReadyFromFacade).toBe(ensureOffscreenDocumentReady);
  expect(resolveCaptureSourceFromFacade).toBe(resolveCaptureSource);
});
