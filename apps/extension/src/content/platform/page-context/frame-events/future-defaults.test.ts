// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  addFutureFrameDefaultsChangedListener,
  dispatchFutureFrameDefaultsChanged,
} from './future-defaults';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';

it('delivers a future-frame defaults snapshot only while its listener is active', () => {
  const listener = vi.fn();
  const cleanup = addFutureFrameDefaultsChangedListener(listener);
  const detail = { kind: 'callout' as const, settings: createDefaultCalloutSettings() };

  dispatchFutureFrameDefaultsChanged(detail);
  expect(listener).toHaveBeenCalledWith(detail);

  cleanup();
  dispatchFutureFrameDefaultsChanged(detail);
  expect(listener).toHaveBeenCalledTimes(1);
});
