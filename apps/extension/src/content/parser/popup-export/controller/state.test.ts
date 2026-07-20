import { expect, it } from 'vitest';

import { createPopupExportState, resetPopupExportState } from './state';

it('creates and resets popup-export controller state', () => {
  const state = createPopupExportState();

  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });

  state.activeExportRequestId = 'req-1';
  state.isExportRunning = true;
  resetPopupExportState(state);

  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});
