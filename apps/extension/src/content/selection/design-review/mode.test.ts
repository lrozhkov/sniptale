import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  deactivateOtherContentModes: vi.fn(),
  dispatchContentModeDisabled: vi.fn(),
  dispatchContentModeEnabled: vi.fn(),
  registerContentMode: vi.fn(),
  setContentModeEnabled: vi.fn(),
  startDesignReviewPicker: vi.fn(),
}));

vi.mock('../../application/mode-session', () => ({
  deactivateOtherContentModes: mocks.deactivateOtherContentModes,
  registerContentMode: mocks.registerContentMode,
  setContentModeEnabled: mocks.setContentModeEnabled,
}));

vi.mock('../../platform/page-context/mode-events', () => ({
  addContentModeDisabledListener: vi.fn(),
  addContentModeEnabledListener: vi.fn(),
  addExitFrameEditingListener: vi.fn(),
  addHighlighterModeChangedListener: vi.fn(),
  dispatchContentModeDisabled: mocks.dispatchContentModeDisabled,
  dispatchContentModeEnabled: mocks.dispatchContentModeEnabled,
  dispatchExitFrameEditing: vi.fn(),
  dispatchHighlighterModeChanged: vi.fn(),
}));

vi.mock('./picker', () => ({
  DesignReviewSelection: undefined,
  startDesignReviewPicker: mocks.startDesignReviewPicker,
}));

import {
  disableDesignReviewMode,
  enableDesignReviewMode,
  getDesignReviewModeState,
  subscribeToDesignReviewMode,
} from './mode';

afterEach(() => {
  disableDesignReviewMode();
  vi.clearAllMocks();
});

it('registers and owns the standalone Design Review mode lifecycle', () => {
  mocks.startDesignReviewPicker.mockReturnValue(mocks.cleanup);
  const listener = vi.fn();
  const unsubscribe = subscribeToDesignReviewMode(listener);

  enableDesignReviewMode();

  expect(mocks.registerContentMode).toHaveBeenCalledWith('design-review', disableDesignReviewMode);
  expect(mocks.deactivateOtherContentModes).toHaveBeenCalledWith('design-review');
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('design-review', true);
  expect(mocks.dispatchContentModeEnabled).toHaveBeenCalledWith({ mode: 'design-review' });
  expect(getDesignReviewModeState()).toMatchObject({ enabled: true, selection: null });

  disableDesignReviewMode();

  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('design-review', false);
  expect(mocks.dispatchContentModeDisabled).toHaveBeenCalledWith({ mode: 'design-review' });
  expect(getDesignReviewModeState()).toMatchObject({ enabled: false, selection: null });
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});
