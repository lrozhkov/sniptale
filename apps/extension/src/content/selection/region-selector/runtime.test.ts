// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  calculateContentSizeTooltipPositionMock,
  setContentSizeTooltipPositionMock,
  syncContentSizeTooltipValuesMock,
  updateOverlayMaskMock,
} = vi.hoisted(() => ({
  calculateContentSizeTooltipPositionMock: vi.fn(),
  setContentSizeTooltipPositionMock: vi.fn(),
  syncContentSizeTooltipValuesMock: vi.fn(),
  updateOverlayMaskMock: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  ContentSizeTooltipDom: undefined,
  createContentSizeTooltipDom: vi.fn(),
  setContentSizeTooltipPosition: setContentSizeTooltipPositionMock,
  syncContentSizeTooltipAspectRatioButtonState: vi.fn(),
  syncContentSizeTooltipValues: syncContentSizeTooltipValuesMock,
}));

vi.mock('@sniptale/ui/content-size-tooltip/core', () => ({
  CONTENT_SIZE_TOOLTIP_DIMENSIONS: { width: 430, height: 46 },
  ContentSizeTooltipCopy: undefined,
  calculateContentSizeTooltipPosition: calculateContentSizeTooltipPositionMock,
  mergeStyleRecords: vi.fn(),
}));

vi.mock('./markup.helpers', () => ({
  updateOverlayMask: updateOverlayMaskMock,
}));

import { updateRegionDisplay } from './runtime';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 720);
  calculateContentSizeTooltipPositionMock.mockReturnValue({ left: 12, top: 24 });
});

describe('region-selector runtime display updates', () => {
  it('updates region, overlay, and tooltip state together', () => {
    const regionSelectorContainer = document.createElement('div');
    const region = document.createElement('div');
    region.id = 'sniptale-region';
    const overlay = document.createElement('div');
    overlay.id = 'sniptale-overlay';
    regionSelectorContainer.append(region, overlay);
    const aspectRatioButton = document.createElement('button');
    aspectRatioButton.setAttribute('aria-pressed', 'true');
    const tooltip = { root: document.createElement('div'), aspectRatioButton };

    updateRegionDisplay(
      regionSelectorContainer as HTMLDivElement,
      { x: 15, y: 25, width: 300, height: 180 },
      tooltip as never
    );

    expect(region.style.left).toBe('15px');
    expect(region.style.top).toBe('25px');
    expect(region.style.width).toBe('300px');
    expect(region.style.height).toBe('180px');
    expect(updateOverlayMaskMock).toHaveBeenCalledWith(overlay, {
      x: 15,
      y: 25,
      width: 300,
      height: 180,
    });
    expect(setContentSizeTooltipPositionMock).toHaveBeenCalledWith(tooltip.root, {
      left: 12,
      top: 24,
    });
    expect(syncContentSizeTooltipValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canToggleAspectRatio: true,
        height: 180,
        maintainAspectRatio: true,
        width: 300,
      })
    );
  });

  it('returns early when the region-selector container is absent', () => {
    updateRegionDisplay(null, { x: 10, y: 20, width: 100, height: 80 }, null);

    expect(updateOverlayMaskMock).not.toHaveBeenCalled();
    expect(syncContentSizeTooltipValuesMock).not.toHaveBeenCalled();
  });
});
