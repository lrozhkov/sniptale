import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createPopupRuntimeStateSlice } from './state';

it('creates supported video capabilities for camera setup tests', () => {
  const state = createPopupRuntimeStateSlice();

  expect(state.environment.activeTabCapabilities.videoByMode[CaptureMode.CAMERA]).toEqual({
    reason: null,
    supported: true,
  });
});
