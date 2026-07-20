// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createContentSizeTooltipDom,
  setContentSizeTooltipPosition,
  syncContentSizeTooltipAspectRatioButtonState,
  syncContentSizeTooltipValues,
} from './dom';
import { getContentSizeTooltipRatioButtonStyle } from './styles';

const copy = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  decreaseHeight: 'Decrease height',
  decreaseWidth: 'Decrease width',
  heightField: 'Height',
  increaseHeight: 'Increase height',
  increaseWidth: 'Increase width',
  keepAspectRatio: 'Keep aspect ratio',
  widthField: 'Width',
};

beforeEach(() => {
  document.body.replaceChildren();
});

function createMountedTooltip(
  overrides: Partial<Parameters<typeof createContentSizeTooltipDom>[0]> = {}
) {
  const mountInto = document.createElement('div');
  document.body.appendChild(mountInto);

  const tooltip = createContentSizeTooltipDom({
    canToggleAspectRatio: false,
    confirmLabel: 'Apply size',
    copy,
    heightMax: 600,
    heightMin: 100,
    maintainAspectRatio: true,
    mountInto,
    widthMax: 800,
    widthMin: 120,
    ...overrides,
  });

  return { mountInto, tooltip };
}

function expectMountedTooltipStructure(
  mountInto: HTMLDivElement,
  tooltip: ReturnType<typeof createMountedTooltip>['tooltip']
) {
  expect(mountInto.contains(tooltip.root)).toBe(true);
  expect(tooltip.root.style.getPropertyValue('backdrop-filter')).toBe('');
  expect(tooltip.root.style.getPropertyValue('border-radius')).toBe('12px');
  expect(tooltip.widthInput.id).toBe('sniptale-width-input');
  expect(tooltip.heightInput.id).toBe('sniptale-height-input');
  expect(tooltip.widthInput.min).toBe('120');
  expect(tooltip.heightInput.max).toBe('600');
  expect(tooltip.cancelButton.textContent).toBe(copy.cancel);
  expect(tooltip.confirmButton.textContent).toBe('Apply size');
  expect(tooltip.aspectRatioButton.disabled).toBe(true);
  expect(
    mountInto.querySelectorAll('style[data-sniptale-content-size-tooltip-style="true"]')
  ).toHaveLength(1);
}

function expectTooltipValuesAtBounds(tooltip: ReturnType<typeof createMountedTooltip>['tooltip']) {
  expect(tooltip.widthInput.value).toBe('120');
  expect(tooltip.heightInput.value).toBe('500');
  expect(tooltip.widthDecreaseButton.disabled).toBe(true);
  expect(tooltip.widthIncreaseButton.disabled).toBe(false);
  expect(tooltip.heightDecreaseButton.disabled).toBe(false);
  expect(tooltip.heightIncreaseButton.disabled).toBe(true);
  expect(tooltip.aspectRatioButton.getAttribute('aria-pressed')).toBe('false');
  expect(tooltip.aspectRatioButton.disabled).toBe(true);
}

function expectTooltipValuesInRange(tooltip: ReturnType<typeof createMountedTooltip>['tooltip']) {
  expect(tooltip.widthInput.value).toBe('333');
  expect(tooltip.heightInput.value).toBe('245');
  expect(tooltip.widthDecreaseButton.disabled).toBe(false);
  expect(tooltip.widthIncreaseButton.disabled).toBe(false);
  expect(tooltip.heightDecreaseButton.disabled).toBe(false);
  expect(tooltip.heightIncreaseButton.disabled).toBe(false);
  expect(tooltip.aspectRatioButton.getAttribute('aria-pressed')).toBe('false');
  expect(tooltip.aspectRatioButton.disabled).toBe(false);
}

function registerCreateMountedTooltipTest() {
  it('creates and mounts the tooltip controls with custom labels', () => {
    const { mountInto, tooltip } = createMountedTooltip();
    expectMountedTooltipStructure(mountInto, tooltip);
  });
}

function registerPositionTest() {
  it('applies absolute tooltip positioning styles', () => {
    const tooltip = document.createElement('div');

    setContentSizeTooltipPosition(tooltip, { x: 24, y: 48 });

    expect(tooltip.style.getPropertyValue('left')).toBe('24px');
    expect(tooltip.style.getPropertyValue('top')).toBe('48px');
  });
}

function registerValueSyncTest() {
  it('syncs input values, stepper disabled states, and aspect ratio button state', () => {
    const { tooltip } = createMountedTooltip({
      heightMax: 500,
      heightMin: 100,
      widthMax: 700,
      widthMin: 120,
    });

    syncContentSizeTooltipValues({
      canToggleAspectRatio: false,
      height: 500,
      heightMax: 500,
      heightMin: 100,
      maintainAspectRatio: true,
      tooltip,
      width: 120,
      widthMax: 700,
      widthMin: 120,
    });
    expectTooltipValuesAtBounds(tooltip);

    syncContentSizeTooltipValues({
      canToggleAspectRatio: true,
      height: 244.6,
      heightMax: 500,
      heightMin: 100,
      maintainAspectRatio: false,
      tooltip,
      width: 333.4,
      widthMax: 700,
      widthMin: 120,
    });
    expectTooltipValuesInRange(tooltip);
  });
}

function registerFocusedDraftSyncTest() {
  it('syncs a focused input after external size changes such as stepper clicks', () => {
    const { tooltip } = createMountedTooltip();

    tooltip.widthInput.focus();
    tooltip.widthInput.value = '';
    syncContentSizeTooltipValues({
      height: 245,
      maintainAspectRatio: false,
      tooltip,
      width: 333,
    });

    expect(tooltip.widthInput.value).toBe('333');
    expect(tooltip.heightInput.value).toBe('245');
  });
}

function registerAspectRatioButtonStateTest() {
  it('syncs aspect-ratio button aria, disabled, and visual state from one helper', () => {
    const button = document.createElement('button');
    const activeStyle = getContentSizeTooltipRatioButtonStyle({ active: true });
    const disabledStyle = getContentSizeTooltipRatioButtonStyle({ active: false, disabled: true });

    syncContentSizeTooltipAspectRatioButtonState(button, { maintainAspectRatio: true });

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.style.getPropertyValue('background')).toBe(String(activeStyle['background']));

    syncContentSizeTooltipAspectRatioButtonState(button, {
      canToggleAspectRatio: false,
      maintainAspectRatio: true,
    });

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.disabled).toBe(true);
    expect(button.style.getPropertyValue('opacity')).toBe(String(disabledStyle['opacity']));
  });
}

function runContentSizeTooltipDomSuite() {
  registerCreateMountedTooltipTest();
  registerPositionTest();
  registerValueSyncTest();
  registerFocusedDraftSyncTest();
  registerAspectRatioButtonStateTest();
}

describe('content-size-tooltip.dom', runContentSizeTooltipDomSuite);
