import { beforeEach, expect, it, vi } from 'vitest';

import { createPopupRuntimeStateSlice } from './test-support/state';

const mocks = vi.hoisted(() => ({
  usePopupLifecycleEffect: vi.fn(),
}));

vi.mock('../lifecycle/effect', () => ({
  usePopupLifecycleEffect: mocks.usePopupLifecycleEffect,
}));

import { usePopupLifecycleSync } from './lifecycle';

beforeEach(() => {
  mocks.usePopupLifecycleEffect.mockReset();
});

it('projects the single popup page setter into lifecycle bootstrap ownership', () => {
  const state = createPopupRuntimeStateSlice();

  usePopupLifecycleSync(state);
  const getParams = mocks.usePopupLifecycleEffect.mock.calls[0]?.[0];

  expect(getParams?.().bootstrap.setPage).toBe(state.session.setPage);
});
