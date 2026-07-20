import { expect, it, vi } from 'vitest';

import { setStartExportProgress } from './progress';

function createState() {
  return {
    setProgress: vi.fn(),
  };
}

it('sets the scanning progress payload for popup export start', () => {
  const state = createState();

  setStartExportProgress(state as never);

  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      phase: 'scanning',
      current: 0,
      total: 0,
    })
  );
});
