import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import {
  setContentSizeTooltipPosition,
  syncContentSizeTooltipValues,
} from '@sniptale/ui/content-size-tooltip/dom';
import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import { MIN_REGION_SELECTOR_SIZE, type RegionBounds } from './helpers';
import { updateOverlayMask } from './markup.helpers';

export function updateRegionDisplay(
  regionSelectorContainer: HTMLDivElement | null,
  currentRegion: RegionBounds,
  tooltip: ContentSizeTooltipDom | null
): void {
  if (!regionSelectorContainer) {
    return;
  }

  const region = regionSelectorContainer.querySelector<HTMLElement>('#sniptale-region');

  if (region) {
    region.style.left = `${currentRegion.x}px`;
    region.style.top = `${currentRegion.y}px`;
    region.style.width = `${currentRegion.width}px`;
    region.style.height = `${currentRegion.height}px`;
  }

  const overlay = regionSelectorContainer.querySelector<HTMLElement>('#sniptale-overlay');
  if (overlay) {
    updateOverlayMask(overlay, currentRegion);
  }

  if (tooltip) {
    const maintainAspectRatio = tooltip.aspectRatioButton.getAttribute('aria-pressed') === 'true';

    setContentSizeTooltipPosition(
      tooltip.root,
      calculateContentSizeTooltipPosition({ anchorRect: currentRegion })
    );
    syncContentSizeTooltipValues({
      tooltip,
      width: currentRegion.width,
      height: currentRegion.height,
      maintainAspectRatio,
      widthMin: MIN_REGION_SELECTOR_SIZE,
      widthMax: window.innerWidth,
      heightMin: MIN_REGION_SELECTOR_SIZE,
      heightMax: window.innerHeight,
      canToggleAspectRatio: true,
    });
  }
}
