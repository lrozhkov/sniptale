// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  configureToastHostAdapter,
  hideAllToasts,
  showToast,
} from '@sniptale/ui/product-feedback/toast-service';

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    hideAllToasts();
  });
  configureToastHostAdapter(null);
  vi.useRealTimers();
  document.body.replaceChildren();
});

function verifyErrorToastFlow() {
  it('renders error toasts through the shared service', async () => {
    vi.useFakeTimers();

    act(() => {
      showToast('Failed to save', 'error', 2000);
    });

    const host = document.querySelector<HTMLElement>('[data-ui="shared.toast.host"]');
    const toast = document.querySelector<HTMLElement>('.sniptale-toast.sniptale-toast-error');

    expect(host).not.toBeNull();
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Failed to save');

    await act(async () => {
      vi.advanceTimersByTime(2300);
      await vi.runAllTimersAsync();
    });

    expect(document.querySelector('[data-ui="shared.toast.host"]')).toBeNull();
    expect(document.querySelector('.sniptale-toast')).toBeNull();
  });
}

function verifySuccessToastFlow() {
  it('renders success toasts through the shared service', async () => {
    vi.useFakeTimers();

    act(() => {
      showToast('Saved', 'success', 2000);
    });

    const host = document.querySelector<HTMLElement>('[data-ui="shared.toast.host"]');
    const toast = document.querySelector<HTMLElement>('.sniptale-toast.sniptale-toast-success');

    expect(host).not.toBeNull();
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Saved');

    await act(async () => {
      vi.advanceTimersByTime(2300);
      await vi.runAllTimersAsync();
    });

    expect(document.querySelector('[data-ui="shared.toast.host"]')).toBeNull();
    expect(document.querySelector('.sniptale-toast')).toBeNull();
  });
}

function verifyInfoAndWarningVariants() {
  it('renders info and warning variants through the shared service', () => {
    vi.useFakeTimers();

    act(() => {
      showToast('Saved', 'info', 5000);
    });

    expect(document.querySelector('.sniptale-toast.sniptale-toast-info')?.textContent).toContain(
      'Saved'
    );

    act(() => {
      hideAllToasts();
      showToast('Heads up', 'warning', 5000);
    });

    expect(document.querySelector('.sniptale-toast.sniptale-toast-warning')?.textContent).toContain(
      'Heads up'
    );
  });
}

function verifyHiddenUiAndInvalidToneGuards() {
  it('ignores hidden host adapters and unsupported toast tones', () => {
    configureToastHostAdapter({
      appendHost: (container) => document.body.appendChild(container),
      isHidden: () => true,
    });

    act(() => {
      showToast('Ignored while hidden', 'info', 5000);
      showToast('Ignored invalid tone', 'debug' as never, 5000);
    });

    expect(document.querySelector('[data-ui="shared.toast.host"]')).toBeNull();
    expect(document.querySelector('.sniptale-toast')).toBeNull();
  });
}

function verifyStackingAndHideAllFlow() {
  it('stacks toast hosts and clears them through the shared hide-all flow', () => {
    act(() => {
      showToast('First', 'info', 5000);
      showToast('Second', 'warning', 5000);
    });

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-ui="shared.toast.host"]')
    );

    expect(hosts).toHaveLength(2);
    expect(hosts[0]?.style.top).toBe('60px');
    expect(hosts[1]?.style.top).toBe('124px');

    act(() => {
      hideAllToasts();
    });

    expect(document.querySelector('[data-ui="shared.toast.host"]')).toBeNull();
  });
}

function runToastServiceSuite() {
  verifyErrorToastFlow();
  verifySuccessToastFlow();
  verifyInfoAndWarningVariants();
  verifyHiddenUiAndInvalidToneGuards();
  verifyStackingAndHideAllFlow();
}

describe('toast-service', runToastServiceSuite);
