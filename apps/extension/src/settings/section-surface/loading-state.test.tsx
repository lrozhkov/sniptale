// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DelayedSettingsCardLoadingState,
  DelayedSettingsCenteredLoadingState,
  SettingsCardLoadingState,
  SettingsCenteredLoadingState,
} from './loading-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SettingsLoadingState', () => {
  it('renders the centered loading card with three skeleton rows', () => {
    renderElement(<SettingsCenteredLoadingState />);

    expect(container?.querySelector('.justify-center')).toBeTruthy();
    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('renders the panel loading state with the full matte card skeleton set', () => {
    renderElement(<SettingsCardLoadingState />);

    expect(container?.firstElementChild?.className).toContain('rounded-[18px]');
    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('delays the centered loading variant until the fallback delay elapses', () => {
    renderElement(<DelayedSettingsCenteredLoadingState />);

    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('delays the card loading variant until the fallback delay elapses', () => {
    renderElement(<DelayedSettingsCardLoadingState />);

    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(container?.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });
});
