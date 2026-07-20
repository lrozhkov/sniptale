// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTooltipDomStyle,
  createTooltipActions,
  createTooltipDivider,
  createTooltipRatioButton,
  createTooltipStepperGroup,
  createTooltipSurface,
  ensureTooltipInputStyles,
} from './dom-helpers';

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

afterEach(() => {
  vi.useRealTimers();
});

function createWidthStepper() {
  return createTooltipStepperGroup({
    copy,
    dimension: 'width',
    fieldLabel: copy.widthField,
    inputId: 'width-input',
    min: 10,
    max: 400,
  });
}

describe('content size tooltip dom helpers styles', () => {
  it('applies camelCase styles as css properties and injects tooltip input styles once', () => {
    const target = document.createElement('div');
    applyTooltipDomStyle(target, {
      borderRadius: '12px',
      opacity: 0.5,
      zIndex: 10,
    });

    expect(target.style.getPropertyValue('border-radius')).toBe('12px');
    expect(target.style.getPropertyValue('opacity')).toBe('0.5');
    expect(target.style.getPropertyValue('z-index')).toBe('10');

    const root = document.createElement('div');
    ensureTooltipInputStyles(root);
    ensureTooltipInputStyles(root);

    expect(
      root.querySelectorAll('style[data-sniptale-content-size-tooltip-style="true"]')
    ).toHaveLength(1);

    const styleText = root.querySelector('style')?.textContent ?? '';
    expect(styleText).toContain('.sniptale-content-size-tooltip-stepper:hover');
    expect(styleText).toContain('.sniptale-content-size-tooltip-stepper:focus-within');
    expect(styleText).toContain('opacity: 0');
    expect(styleText).toContain('opacity: 1');
  });
});

describe('content size tooltip dom helpers controls', () => {
  it('creates stepper groups with labelled buttons, inputs, and dimension targets', () => {
    const group = createWidthStepper();

    expect(group.input.id).toBe('width-input');
    expect(group.input.className).toContain('sniptale-content-size-tooltip-input');
    expect(group.input.min).toBe('10');
    expect(group.input.max).toBe('400');
    expect(group.decreaseButton.dataset['target']).toBe('width');
    expect(group.decreaseButton.getAttribute('aria-label')).toBe(copy.decreaseWidth);
    expect(group.decreaseButton.style.height).toBe('13px');
    expect(group.decreaseButton.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.3');
    expect(group.group.className).toContain('sniptale-content-size-tooltip-stepper');
    expect(group.group.children[0]).toBe(group.input);
    expect(group.group.children[1]?.className).toContain(
      'sniptale-content-size-tooltip-stepper-controls'
    );
    expect(group.increaseButton.dataset['target']).toBe('width');
    expect(group.increaseButton.getAttribute('aria-label')).toBe(copy.increaseWidth);
    expect(group.increaseButton.querySelectorAll('svg path')).toHaveLength(1);
    expect(group.group.children).toHaveLength(2);
  });

  it('repeats stepper clicks while held and stops on pointer release', () => {
    vi.useFakeTimers();
    const group = createWidthStepper();
    const onIncrease = vi.fn();
    group.increaseButton.addEventListener('click', onIncrease);

    group.increaseButton.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })
    );
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new MouseEvent('pointerup'));
    vi.advanceTimersByTime(500);

    expect(onIncrease).toHaveBeenCalledTimes(4);
  });
});

describe('content size tooltip dom helpers action controls', () => {
  it('creates ratio and action buttons with disabled and custom label states', () => {
    const ratioButton = createTooltipRatioButton(copy, true);
    const { actions, cancelButton, confirmButton } = createTooltipActions(copy, 'Apply size');

    expect(ratioButton.disabled).toBe(true);
    expect(ratioButton.getAttribute('aria-pressed')).toBe('false');
    expect(ratioButton.title).toBe(copy.keepAspectRatio);
    expect(ratioButton.querySelectorAll('svg path')).toHaveLength(2);
    expect(cancelButton.textContent).toBe(copy.cancel);
    expect(confirmButton.textContent).toBe('Apply size');
    expect(actions.children).toHaveLength(2);
  });

  it('uses the default confirm label and active ratio button state when enabled', () => {
    const ratioButton = createTooltipRatioButton(copy, false);
    const { confirmButton } = createTooltipActions(copy);

    expect(ratioButton.disabled).toBe(false);
    expect(ratioButton.getAttribute('aria-pressed')).toBe('false');
    expect(confirmButton.textContent).toBe(copy.confirm);
  });
});

describe('content size tooltip dom helpers surface', () => {
  it('creates a divider and prevents mousedown/click propagation from the tooltip root', () => {
    const divider = createTooltipDivider();
    const surface = createTooltipSurface();
    const eventLog: string[] = [];

    expect(divider.getAttribute('aria-hidden')).toBe('true');

    const wrapper = document.createElement('div');
    wrapper.addEventListener('mousedown', () => eventLog.push('mousedown'));
    wrapper.addEventListener('click', () => eventLog.push('click'));
    wrapper.appendChild(surface);
    document.body.appendChild(wrapper);

    surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(eventLog).toEqual([]);
  });
});
