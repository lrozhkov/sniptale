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
import { createSelectionCaptureMenuChevron } from '../selection-mode/ui/final-elements/icons';

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
  ratioSelect: HTMLSelectElement;
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
    args.ratioSelect.value = nextMaintainAspectRatio ? 'current' : 'free';
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
}): ContentSizeTooltipDom {
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

  return tooltip;
}

function createRegionAspectRatioSelect(args: {
  tooltip: ContentSizeTooltipDom;
  aspectRatioState: RegionSelectorAspectRatioState;
  getCurrentRegion: () => RegionBounds;
  onRegionChange: (nextRegion: RegionBounds) => void;
}): HTMLSelectElement {
  const select = document.createElement('select');
  select.setAttribute('aria-label', translate('content.overlayControls.regionAspectRatio'));
  select.dataset['ui'] = 'content.region-aspect-ratio';
  select.style.cssText = [
    'height: 32px; max-width: 140px; border: 0; border-radius: 4px; padding: 0 40px 0 8px; appearance: none;',
    'background: var(--sniptale-color-surface-input); color: var(--sniptale-color-text-primary);',
    'font: inherit; font-weight: 400; cursor: pointer;',
  ].join(' ');
  const presets = [
    ['free', translate('content.overlayControls.regionAspectFree')],
    ['current', translate('content.overlayControls.regionAspectCurrent')],
    ['16:9', '16:9'],
    ['4:3', '4:3'],
    ['1:1', '1:1'],
    ['9:16', '9:16'],
  ] as const;
  for (const [value, label] of presets) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = args.aspectRatioState.maintainAspectRatio ? 'current' : 'free';
  select.addEventListener('change', () => {
    const current = args.getCurrentRegion();
    const ratios: Record<string, number> = {
      '16:9': 16 / 9,
      '4:3': 4 / 3,
      '1:1': 1,
      '9:16': 9 / 16,
    };
    const ratio =
      select.value === 'current' ? current.width / current.height : (ratios[select.value] ?? null);
    args.aspectRatioState.aspectRatio = ratio;
    args.aspectRatioState.maintainAspectRatio = ratio !== null;
    syncContentSizeTooltipAspectRatioButtonState(args.tooltip.aspectRatioButton, {
      maintainAspectRatio: ratio !== null,
      canToggleAspectRatio: true,
    });
    if (ratio)
      args.onRegionChange(resizeRegionWithAspectRatio(current, 'width', current.width, ratio));
  });
  const wrapper = document.createElement('span');
  wrapper.style.cssText = 'position: relative; display: inline-flex; flex: 0 0 auto;';
  const chevron = createSelectionCaptureMenuChevron();
  chevron.setAttribute('width', '16');
  chevron.setAttribute('height', '16');
  chevron.setAttribute('class', 'sniptale-select-chevron sniptale-select-chevron-edge');
  chevron.style.cssText = [
    'position: absolute; right: 13px; top: 50%; transform: translateY(-50%);',
    'pointer-events: none; color: var(--sniptale-color-text-dim);',
  ].join(' ');
  wrapper.append(select, chevron);
  args.tooltip.root.prepend(wrapper);
  return select;
}
