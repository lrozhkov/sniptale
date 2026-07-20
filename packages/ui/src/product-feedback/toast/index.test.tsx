// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProductCountdownToast,
  ProductToast,
  type ProductCountdownToastProps,
  type ProductToastProps,
} from './index';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function renderToast(props: Partial<ProductToastProps> = {}) {
  renderNode(<ProductToast message="Toast message" {...props} />);
}

function renderCountdownToast(props: Partial<ProductCountdownToastProps> = {}) {
  renderNode(
    <ProductCountdownToast
      cancelLabel="Cancel countdown"
      count={3}
      labelPrefix="Starts in"
      labelSuffix="seconds"
      onCancel={() => undefined}
      {...props}
    />
  );
}

function getToastElement() {
  return container?.querySelector<HTMLElement>('.sniptale-toast') ?? null;
}

function getCountdownNumberElement() {
  return container?.querySelector<HTMLElement>('.sniptale-countdown-number') ?? null;
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

describe('ProductToast rendering', () => {
  it('renders an info toast with polite status semantics by default', () => {
    renderToast();

    const toast = getToastElement();

    expect(toast).not.toBeNull();
    expect(toast?.className).toContain('sniptale-toast-info');
    expect(toast?.hasAttribute('style')).toBe(false);
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(toast?.querySelector('.sniptale-toast-icon-wrapper')).toBeNull();
  });

  it('renders success and error tones with the correct accessibility semantics', () => {
    renderToast({
      message: 'Success',
      tone: 'success',
    });

    const successToast = getToastElement();

    expect(successToast?.className).toContain('sniptale-toast-success');
    expect(successToast?.getAttribute('role')).toBe('status');
    expect(successToast?.getAttribute('aria-live')).toBe('polite');
    expect(successToast?.querySelector('.sniptale-toast-icon-wrapper')).toBeNull();

    renderToast({
      message: 'Error',
      tone: 'error',
    });

    const errorToast = getToastElement();

    expect(errorToast?.className).toContain('sniptale-toast-error');
    expect(errorToast?.getAttribute('role')).toBe('alert');
    expect(errorToast?.getAttribute('aria-live')).toBe('assertive');
    expect(errorToast?.querySelector('.sniptale-toast-icon-wrapper')).toBeNull();
  });

  it('syncs the exiting class when the prop changes', () => {
    renderToast({ exiting: false });

    expect(getToastElement()?.className).not.toContain('sniptale-toast-exiting');

    renderToast({ exiting: true });

    expect(getToastElement()?.className).toContain('sniptale-toast-exiting');
  });
});

describe('ProductToast lifecycle', () => {
  it('auto-dismisses after the configured duration and exit delay', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    renderToast({
      duration: 100,
      onClose,
    });

    expect(getToastElement()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(getToastElement()?.className).toContain('sniptale-toast-exiting');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(getToastElement()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears the delayed exit callback when the toast unmounts early', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    renderToast({
      duration: 100,
      onClose,
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      root?.render(null);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ProductCountdownToast', () => {
  it('animates the countdown number and wires the cancel button', () => {
    const onCancel = vi.fn();

    renderCountdownToast({ onCancel });

    const cancelButton =
      container?.querySelector<HTMLButtonElement>('[aria-label="Cancel countdown"]') ?? null;
    const countdownNumber = getCountdownNumberElement();

    expect(cancelButton).not.toBeNull();
    expect(countdownNumber?.classList.contains('sniptale-pulse')).toBe(true);

    act(() => {
      cancelButton?.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);

    renderCountdownToast({
      count: 2,
      onCancel,
    });

    expect(getCountdownNumberElement()?.classList.contains('sniptale-pulse')).toBe(true);
  });

  it('skips the pulse effect when the countdown number cannot be resolved', () => {
    vi.spyOn(document, 'getElementById').mockReturnValue(null);

    renderCountdownToast();

    expect(getCountdownNumberElement()).not.toBeNull();
    expect(getCountdownNumberElement()?.classList.contains('sniptale-pulse')).toBe(false);
  });
});

describe('ProductCountdownToast cancellation affordance', () => {
  it('omits the cancel button when cancel props are incomplete', () => {
    renderNode(<ProductCountdownToast count={3} labelPrefix="Starts in" labelSuffix="seconds" />);

    expect(container?.querySelector('.sniptale-countdown-cancel')).toBeNull();

    renderNode(
      <ProductCountdownToast
        cancelLabel="Cancel countdown"
        count={3}
        labelPrefix="Starts in"
        labelSuffix="seconds"
      />
    );

    expect(container?.querySelector('.sniptale-countdown-cancel')).toBeNull();
  });
});
