import { expect, it } from 'vitest';

import { abortVideoRecordingStartIfCancelled } from './flow-cancellation';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { cleanupViewportEmulation, configureViewportEmulation } from './viewport';
import {
  enableAnnotationsIfNeeded,
  ensureOffscreenDocumentReady,
  resolveCaptureSource,
} from './preflight';
import {
  defaultAnnotationSetupDeps,
  defaultCaptureSourceResolverDeps,
  defaultOffscreenSetupDeps,
  defaultViewportSetupDeps,
} from './transport.deps';

it('wires transport default deps to the canonical owner seams', () => {
  expect(defaultCaptureSourceResolverDeps.resolveCaptureSource).toBe(resolveCaptureSource);
  expect(defaultOffscreenSetupDeps.ensureOffscreenDocumentReady).toBe(ensureOffscreenDocumentReady);
  expect(defaultAnnotationSetupDeps.enableAnnotationsIfNeeded).toBe(enableAnnotationsIfNeeded);
  expect(defaultOffscreenSetupDeps.abortStart).toBe(abortVideoRecordingStartIfCancelled);
  expect(defaultAnnotationSetupDeps.abortStart).toBe(abortVideoRecordingStartIfCancelled);
  expect(defaultViewportSetupDeps.abortStart).toBe(abortVideoRecordingStartIfCancelled);
  expect(defaultViewportSetupDeps.cleanupViewportEmulation).toBe(cleanupViewportEmulation);
  expect(defaultViewportSetupDeps.configureViewportEmulation).toBe(configureViewportEmulation);
  expect(defaultViewportSetupDeps.notifyStartFailed).toBe(notifyRecordingStartFailed);
});
