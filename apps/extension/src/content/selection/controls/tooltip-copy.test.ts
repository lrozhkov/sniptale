import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import {
  getOverlayControlsRegionConfirmTooltipCopy,
  getOverlayControlsSaveTooltipCopy,
  getOverlayControlsTooltipCopy,
} from './tooltip-copy';

describe('overlay controls tooltip copy', () => {
  it('builds canonical overlay control copy with the provided confirm key', () => {
    expect(getOverlayControlsTooltipCopy('content.overlayControls.save')).toEqual({
      widthField: 't:content.overlayControls.widthField',
      heightField: 't:content.overlayControls.heightField',
      decreaseWidth: 't:content.overlayControls.decreaseWidth',
      increaseWidth: 't:content.overlayControls.increaseWidth',
      decreaseHeight: 't:content.overlayControls.decreaseHeight',
      increaseHeight: 't:content.overlayControls.increaseHeight',
      keepAspectRatio: 't:content.overlayControls.keepAspectRatioTitle',
      cancel: 't:content.overlayControls.cancel',
      confirm: 't:content.overlayControls.save',
    });
  });

  it('exposes dedicated helpers for region-confirm and save tooltip copy', () => {
    expect(getOverlayControlsRegionConfirmTooltipCopy()).toEqual(
      getOverlayControlsTooltipCopy('content.overlayControls.regionConfirm')
    );
    expect(getOverlayControlsSaveTooltipCopy()).toEqual(
      getOverlayControlsTooltipCopy('content.overlayControls.save')
    );
  });
});
