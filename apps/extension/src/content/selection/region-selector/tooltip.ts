import {
  createContentSizeTooltipDom,
  syncContentSizeTooltipAspectRatioButtonState,
  type ContentSizeTooltipDom,
} from '@sniptale/ui/content-size-tooltip/dom';
import { MIN_REGION_SELECTOR_SIZE, resizeRegionDimension, type RegionBounds } from './helpers';
import { getOverlayControlsRegionConfirmTooltipCopy } from '../controls/tooltip-copy';

const REGION_SELECTOR_STEP = 10;

interface RegionSelectorAspectRatioState {
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
}

function clampRegionInput(value: string, max: number) {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue)) {
    return MIN_REGION_SELECTOR_SIZE;
  }

  return Math.min(max, Math.max(MIN_REGION_SELECTOR_SIZE, parsedValue));
}

function bindRegionSelectorDimensionButtons(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  onRegionChange: (nextRegion: RegionBounds) => void;
}) {
  const applyDelta = (button: HTMLElement, delta: number) => {
    const target = button.dataset['target'];
    if (target !== 'width' && target !== 'height') {
      return;
    }

    const currentRegion = args.getCurrentRegion();
    const currentValue = target === 'width' ? currentRegion.width : currentRegion.height;
    args.onRegionChange(
      resizeRegionDimensionWithAspectRatio(
        currentRegion,
        target,
        currentValue + delta,
        args.aspectRatioState
      )
    );
  };

  args.tooltip.root.querySelectorAll('.sniptale-size-btn-minus').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyDelta(button as HTMLElement, -REGION_SELECTOR_STEP);
    });
  });

  args.tooltip.root.querySelectorAll('.sniptale-size-btn-plus').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyDelta(button as HTMLElement, REGION_SELECTOR_STEP);
    });
  });
}

function bindRegionSelectorDimensionInputs(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  onRegionChange: (nextRegion: RegionBounds) => void;
}) {
  const bindInput = (input: HTMLInputElement, dimension: 'width' | 'height', max: number) => {
    const commit = () => {
      const currentRegion = args.getCurrentRegion();
      if (input.value.trim() === '') {
        input.value = Math.round(currentRegion[dimension]).toString();
        return;
      }

      args.onRegionChange(
        resizeRegionDimensionWithAspectRatio(
          currentRegion,
          dimension,
          clampRegionInput(input.value, max),
          args.aspectRatioState
        )
      );
    };

    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      commit();
    });
  };

  bindInput(args.tooltip.widthInput, 'width', window.innerWidth);
  bindInput(args.tooltip.heightInput, 'height', window.innerHeight);
}

function resizeRegionDimensionWithAspectRatio(
  region: RegionBounds,
  dimension: 'width' | 'height',
  nextValue: number,
  state: RegionSelectorAspectRatioState
): RegionBounds {
  const aspectRatio = state.maintainAspectRatio ? state.aspectRatio : null;
  if (!aspectRatio) {
    return resizeRegionDimension(region, dimension, nextValue);
  }

  if (dimension === 'width') {
    const nextHeight = Math.round(nextValue / aspectRatio);
    const widthResizedRegion = resizeRegionDimension(region, 'width', nextValue);
    return resizeRegionDimension(widthResizedRegion, 'height', nextHeight);
  }

  const nextWidth = Math.round(nextValue * aspectRatio);
  const heightResizedRegion = resizeRegionDimension(region, 'height', nextValue);
  return resizeRegionDimension(heightResizedRegion, 'width', nextWidth);
}

function bindRegionSelectorAspectRatioButton(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
}) {
  args.tooltip.aspectRatioButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const nextMaintainAspectRatio = !args.aspectRatioState.maintainAspectRatio;
    const currentRegion = args.getCurrentRegion();
    args.aspectRatioState.maintainAspectRatio = nextMaintainAspectRatio;
    args.aspectRatioState.aspectRatio = nextMaintainAspectRatio
      ? currentRegion.width / currentRegion.height
      : null;
    syncContentSizeTooltipAspectRatioButtonState(args.tooltip.aspectRatioButton, {
      maintainAspectRatio: nextMaintainAspectRatio,
      canToggleAspectRatio: true,
    });
  });
}

function bindRegionSelectorActions(args: {
  tooltip: ContentSizeTooltipDom;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  args.tooltip.cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    args.onCancel();
  });

  args.tooltip.confirmButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    args.onConfirm();
  });
}

export function createRegionSelectorTooltip(args: {
  getCurrentRegion: () => RegionBounds;
  mountInto: HTMLElement;
  onCancel: () => void;
  onConfirm: () => void;
  onRegionChange: (nextRegion: RegionBounds) => void;
}): ContentSizeTooltipDom {
  const aspectRatioState: RegionSelectorAspectRatioState = {
    maintainAspectRatio: false,
    aspectRatio: null,
  };
  const tooltip = createContentSizeTooltipDom({
    copy: getOverlayControlsRegionConfirmTooltipCopy(),
    mountInto: args.mountInto,
    widthMin: MIN_REGION_SELECTOR_SIZE,
    widthMax: window.innerWidth,
    heightMin: MIN_REGION_SELECTOR_SIZE,
    heightMax: window.innerHeight,
    maintainAspectRatio: false,
    canToggleAspectRatio: true,
  });

  bindRegionSelectorDimensionButtons({
    tooltip,
    aspectRatioState,
    getCurrentRegion: args.getCurrentRegion,
    onRegionChange: args.onRegionChange,
  });
  bindRegionSelectorDimensionInputs({
    tooltip,
    aspectRatioState,
    getCurrentRegion: args.getCurrentRegion,
    onRegionChange: args.onRegionChange,
  });
  bindRegionSelectorAspectRatioButton({
    tooltip,
    aspectRatioState,
    getCurrentRegion: args.getCurrentRegion,
  });
  bindRegionSelectorActions({
    tooltip,
    onCancel: args.onCancel,
    onConfirm: args.onConfirm,
  });

  return tooltip;
}
