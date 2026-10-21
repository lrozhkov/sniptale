import {
  createContentSizeTooltipDom,
  syncContentSizeTooltipAspectRatioButtonState,
  type ContentSizeTooltipDom,
} from '@sniptale/ui/content-size-tooltip/dom';
import {
  MIN_REGION_SELECTOR_SIZE,
  resizeRegionDimension,
  resizeRegionWithAspectRatio,
  type RegionBounds,
} from './helpers';
import { getOverlayControlsRegionConfirmTooltipCopy } from '../controls/tooltip-copy';
import { translate } from '../../../platform/i18n';
import { createRegionAspectRatioView } from './aspect-ratio-view';
import type { RegionSelectorTooltipDom } from './types';

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

  return resizeRegionWithAspectRatio(region, dimension, nextValue, aspectRatio);
}

function bindRegionSelectorAspectRatioButton(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  ratioSelect: ReturnType<typeof createRegionAspectRatioView>;
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
    args.ratioSelect.render(nextMaintainAspectRatio ? 'current' : 'free');
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
  aspectRatioState?: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  mountInto: HTMLElement;
  onCancel: () => void;
  onConfirm: () => void;
  onRegionChange: (nextRegion: RegionBounds) => void;
}): RegionSelectorTooltipDom {
  const aspectRatioState: RegionSelectorAspectRatioState = args.aspectRatioState ?? {
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
    maintainAspectRatio: aspectRatioState.maintainAspectRatio,
    canToggleAspectRatio: true,
    variant: 'frame-edit',
  });
  tooltip.root.style.minHeight = 'var(--sniptale-toolbar-shell-height, 50px)';
  tooltip.root.style.maxWidth = 'calc(100vw - 16px)';
  tooltip.root.style.flexWrap = 'wrap';
  tooltip.root.style.width = 'max-content';
  tooltip.root.style.minWidth = '0';
  tooltip.widthInput.step = '2';
  tooltip.heightInput.step = '2';
  const confirmText = document.createElement('span');
  confirmText.textContent = translate('content.overlayControls.regionConfirm');
  tooltip.confirmButton.append(confirmText);
  tooltip.confirmButton.style.width = 'auto';
  tooltip.confirmButton.style.flex = '0 0 auto';
  tooltip.confirmButton.style.padding = '0 8px';
  tooltip.confirmButton.style.lineHeight = '18px';
  tooltip.confirmButton.style.gap = '6px';
  tooltip.actions.replaceChildren(tooltip.confirmButton, tooltip.cancelButton);
  const ratioSelect = createRegionAspectRatioSelect({ ...args, tooltip, aspectRatioState });

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
    ratioSelect,
  });
  bindRegionSelectorActions({
    tooltip,
    onCancel: args.onCancel,
    onConfirm: args.onConfirm,
  });

  return {
    ...tooltip,
    dispose: () => ratioSelect.dispose(),
    dismissMenu: () => ratioSelect.dismissMenu(),
  };
}

function createRegionAspectRatioSelect(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  onRegionChange: (nextRegion: RegionBounds) => void;
}): ReturnType<typeof createRegionAspectRatioView> {
  const select = createRegionAspectRatioView(args.tooltip.root, (value) => {
    const current = args.getCurrentRegion();
    const ratios: Record<string, number> = {
      '16:9': 16 / 9,
      '4:3': 4 / 3,
      '1:1': 1,
      '9:16': 9 / 16,
    };
    const ratio = value === 'current' ? current.width / current.height : (ratios[value] ?? null);
    args.aspectRatioState.aspectRatio = ratio;
    args.aspectRatioState.maintainAspectRatio = ratio !== null;
    syncContentSizeTooltipAspectRatioButtonState(args.tooltip.aspectRatioButton, {
      maintainAspectRatio: ratio !== null,
      canToggleAspectRatio: true,
    });
    if (ratio)
      args.onRegionChange(resizeRegionWithAspectRatio(current, 'width', current.width, ratio));
    select.render(value);
  });
  select.render(args.aspectRatioState.maintainAspectRatio ? 'current' : 'free');
  return select;
}
