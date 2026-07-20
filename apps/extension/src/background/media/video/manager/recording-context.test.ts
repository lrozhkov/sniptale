import { expect, it } from 'vitest';

import { initializeRecordingContext } from './recording-context.prepare';
import { normalizeViewportPreset } from './recording-context.viewport';
import {
  normalizeViewportPreset as normalizeViewportPresetFromFacade,
  initializeRecordingContext as initializeRecordingContextFromFacade,
} from './recording-context';

it('re-exports the recording-context helpers from their owner-local seams without wrapping them', () => {
  expect(normalizeViewportPresetFromFacade).toBe(normalizeViewportPreset);
  expect(initializeRecordingContextFromFacade).toBe(initializeRecordingContext);
});
