// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentSizeTooltipProps } from './types';
import { ContentSizeTooltipContent } from './views';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<ContentSizeTooltipProps & { canToggleAspectRatio: boolean }> = {}
) {
  return {
    canToggleAspectRatio: true,
    copy: {
      cancel: 'Cancel',
      confirm: 'Apply size',
      decreaseHeight: 'Decrease height',
      decreaseWidth: 'Decrease width',
      heightField: 'Height',
      increaseHeight: 'Increase height',
      increaseWidth: 'Increase width',
      keepAspectRatio: 'Keep aspect ratio',
      widthField: 'Width',
    },
    heightMax: 600,
    heightMin: 120,
    heightValue: 240,
    maintainAspectRatio: true,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onHeightChangeCommit: vi.fn(),
    onHeightChangeRaw: vi.fn(),
    onHeightDecrease: vi.fn(),
    onHeightIncrease: vi.fn(),
    onToggleAspectRatio: vi.fn(),
    onWidthChangeCommit: vi.fn(),
    onWidthChangeRaw: vi.fn(),
    onWidthDecrease: vi.fn(),
    onWidthIncrease: vi.fn(),
    position: { x: 0, y: 0 },
    widthMax: 800,
    widthMin: 100,
    widthValue: 320,
    ...overrides,
  };
}

function renderTooltip(
  overrides: Partial<ContentSizeTooltipProps & { canToggleAspectRatio: boolean }> = {}
) {
  const props = createProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ContentSizeTooltipContent {...props} />);
  });

  return props;
}

function getButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? null;
}

function getInput(label: string) {
  return container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? null;
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) {
    return;
  }

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setInputDomValue(input: HTMLInputElement | null, value: string) {
  if (!input) {
    return;
  }

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, value);
}

function blurInput(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }

  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ContentSizeTooltipContent rendering', () => {
  it('renders the steppers and action controls with the expected labels', () => {
    renderTooltip();

    expect(getButton('Decrease width')).toBeTruthy();
    expect(getButton('Decrease width')?.className).toContain('sniptale-size-btn');
    expect(getButton('Increase width')?.className).toContain('sniptale-size-btn-plus');
    expect(getInput('Width')?.value).toBe('320');
    expect(getInput('Height')?.value).toBe('240');
    expect(container?.querySelectorAll('.sniptale-content-size-tooltip-stepper')).toHaveLength(2);
    expect(getButton('Keep aspect ratio')?.previousElementSibling).toBe(
      getInput('Width')?.parentElement
    );
    expect(getButton('Keep aspect ratio')?.nextElementSibling).toBe(
      getInput('Height')?.parentElement
    );
    expect(container?.textContent).toContain('Cancel');
    expect(container?.textContent).toContain('Apply size');
  });
});

describe('ContentSizeTooltipContent enabled actions', () => {
  it('calls stepper, toggle and action handlers for enabled controls', () => {
    const props = renderTooltip();

    act(() => {
      getButton('Increase width')?.click();
      getButton('Decrease height')?.click();
      getButton('Keep aspect ratio')?.click();
      container?.querySelectorAll<HTMLButtonElement>('button[type="button"]').forEach((button) => {
        if (button.textContent === 'Cancel' || button.textContent === 'Apply size') {
          button.click();
        }
      });
    });

    expect(props.onWidthIncrease).toHaveBeenCalledTimes(1);
    expect(props.onHeightDecrease).toHaveBeenCalledTimes(1);
    expect(props.onToggleAspectRatio).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ContentSizeTooltipContent disabled actions', () => {
  it('does not call disabled stepper or aspect-ratio handlers', () => {
    const props = renderTooltip({
      canToggleAspectRatio: false,
      heightValue: 120,
      widthValue: 800,
    });

    act(() => {
      getButton('Increase width')?.click();
      getButton('Decrease height')?.click();
      getButton('Keep aspect ratio')?.click();
    });

    expect(getButton('Increase width')?.disabled).toBe(true);
    expect(getButton('Decrease height')?.disabled).toBe(true);
    expect(getButton('Keep aspect ratio')?.disabled).toBe(true);
    expect(getButton('Keep aspect ratio')?.getAttribute('aria-pressed')).toBeNull();
    expect(props.onWidthIncrease).not.toHaveBeenCalled();
    expect(props.onHeightDecrease).not.toHaveBeenCalled();
    expect(props.onToggleAspectRatio).not.toHaveBeenCalled();
  });
});

describe('ContentSizeTooltipContent repeat actions', () => {
  it('repeats stepper actions while held and stops on pointer release', () => {
    vi.useFakeTimers();
    const props = renderTooltip();
    const increaseWidth = getButton('Increase width');

    act(() => {
      increaseWidth?.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })
      );
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new MouseEvent('pointerup'));
      vi.advanceTimersByTime(500);
    });

    expect(props.onWidthIncrease).toHaveBeenCalledTimes(4);
  });
});

describe('ContentSizeTooltipContent inputs', () => {
  it('keeps typed input local and clamps committed values on blur', () => {
    const props = renderTooltip();
    const widthInput = getInput('Width');
    const heightInput = getInput('Height');

    act(() => {
      setInputValue(widthInput, '450');
      setInputDomValue(heightInput, '999');
      blurInput(heightInput);
    });

    expect(widthInput?.value).toBe('450');
    expect(props.onWidthChangeRaw).not.toHaveBeenCalled();
    expect(props.onHeightChangeCommit).toHaveBeenCalledWith(600);
  });

  it('ignores invalid raw input and falls back to the minimum value on blur', () => {
    const props = renderTooltip();
    const widthInput = getInput('Width');
    const heightInput = getInput('Height');

    act(() => {
      setInputValue(widthInput, 'abc');
      setInputDomValue(heightInput, '0');
      blurInput(heightInput);
    });

    expect(props.onWidthChangeRaw).not.toHaveBeenCalled();
    expect(props.onHeightChangeCommit).toHaveBeenCalledWith(120);
  });
});

describe('ContentSizeTooltipContent stepper input sync', () => {
  it('syncs the visible input value after a stepper click', () => {
    renderTooltip();
    const widthInput = getInput('Width');

    act(() => {
      root?.render(<ContentSizeTooltipContent {...createProps({ widthValue: 330 })} />);
    });

    expect(widthInput?.value).toBe('330');
  });
});

describe('ContentSizeTooltipContent input keyboard commit', () => {
  it('commits the current draft when Enter is pressed', () => {
    const props = renderTooltip();
    const widthInput = getInput('Width');

    act(() => {
      setInputValue(widthInput, '455');
      widthInput?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
      );
    });

    expect(props.onWidthChangeCommit).toHaveBeenCalledWith(455);
    expect(widthInput?.value).toBe('455');
  });
});

describe('ContentSizeTooltipContent empty input draft', () => {
  it('keeps an empty draft local and restores the current value on blur', () => {
    const props = renderTooltip({ widthMin: 1 });
    const widthInput = getInput('Width');

    act(() => {
      widthInput?.focus();
      setInputValue(widthInput, '');
    });

    expect(widthInput?.value).toBe('');
    expect(props.onWidthChangeRaw).not.toHaveBeenCalled();

    act(() => {
      blurInput(widthInput);
    });

    expect(props.onWidthChangeCommit).not.toHaveBeenCalled();
    expect(widthInput?.value).toBe('320');
  });
});
