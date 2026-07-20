import { expect, it, vi } from 'vitest';

import { createPopupRuntimeStateSlice } from '../test-support/state';
import { assemblePopupRecordingControls } from './recording-data';

it('passes start error authority through the production recording controls assembly', () => {
  const setStartError = vi.fn();
  const state = createPopupRuntimeStateSlice({ setStartError });

  const recording = assemblePopupRecordingControls(state);

  recording.setStartError('viewport failed');
  expect(setStartError).toHaveBeenCalledWith('viewport failed');
});
