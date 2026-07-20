import { expect, it, vi } from 'vitest';
import { setWebSnapshotError } from './state';
import { createPopupExportRuntimeStateFixture } from '../state.test-support';

it('normalizes non-error snapshot failures into popup progress and result state', () => {
  const state = createPopupExportRuntimeStateFixture({
    setProgress: vi.fn(),
    setResult: vi.fn(),
  });

  setWebSnapshotError(state, 'denied');

  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: ['denied'],
      message: 'denied',
      phase: 'error',
    })
  );
  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: ['denied'],
      success: false,
    })
  );
});
