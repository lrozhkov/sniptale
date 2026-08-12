import { expect, it } from 'vitest';

import { abortVideoRecordingStartIfCancelled } from './flow-cancellation';
import {
  prepareContentSurfaceIfNeeded,
  ensureOffscreenDocumentReady,
  resolveCaptureSource,
} from './preflight';
import {
  defaultContentSurfaceSetupDeps,
  defaultCaptureSourceResolverDeps,
  defaultOffscreenSetupDeps,
} from './transport.deps';

it('wires transport default deps to the canonical owner seams', () => {
  expect(defaultCaptureSourceResolverDeps.resolveCaptureSource).toBe(resolveCaptureSource);
  expect(defaultOffscreenSetupDeps.ensureOffscreenDocumentReady).toBe(ensureOffscreenDocumentReady);
  expect(defaultContentSurfaceSetupDeps.prepareContentSurfaceIfNeeded).toBe(
    prepareContentSurfaceIfNeeded
  );
  expect(defaultOffscreenSetupDeps.abortStart).toBe(abortVideoRecordingStartIfCancelled);
  expect(defaultContentSurfaceSetupDeps.abortStart).toBe(abortVideoRecordingStartIfCancelled);
});
