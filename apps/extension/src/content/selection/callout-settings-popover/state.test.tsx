// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalloutPopoverSettingsChangedListener } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { useCalloutSettingsPopoverState } from './state';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useCalloutSettingsPopoverState> | null = null;
let isOpen = true;
let settings: CalloutSettings | undefined;

function Harness() {
  latestState = useCalloutSettingsPopoverState({
    frameId: 'frame-1',
    isOpen,
    ...(settings ? { settings } : {}),
  });
  return null;
}

function renderHarness(nextIsOpen = true) {
  isOpen = nextIsOpen;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  isOpen = true;
  settings = undefined;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('useCalloutSettingsPopoverState', () => {
  it('dispatches callout popover setting changes through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);

    renderHarness();
    act(() => {
      latestState?.handleSettingChange('variant', 'text-only');
    });

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { variant: 'text-only' },
    });

    cleanup();
  });

  it('opens and commits one history transaction for the popover session', () => {
    const beginTransactionSpy = vi.spyOn(pagePreparationHistory, 'beginTransaction');
    const commitTransactionSpy = vi.spyOn(pagePreparationHistory, 'commitTransaction');

    renderHarness(true);
    expect(beginTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');

    renderHarness(false);
    expect(commitTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');
  });

  it('clears manual placement when an anchor or side is selected', () => {
    settings = {
      anchor: 'top-center',
      bgColor: '#fff',
      enabled: true,
      fontFamily: 'sans',
      fontSize: 14,
      fontWeight: 'normal',
      htmlContent: 'Comment',
      maxWidth: 200,
      manualPlacement: { centerOffsetX: 60, centerOffsetY: -30 },
      tailBasePosition: 0.75,
      tailBaseWidth: 0.2,
      tailFramePosition: 0.25,
      side: 'auto',
      tailSize: 8,
      textColor: '#111',
      variant: 'bubble',
    };
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);
    renderHarness();

    act(() => latestState?.handleSettingChange('side', 'right'));

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: {
        side: 'right',
        manualPlacement: undefined,
        tailBasePosition: undefined,
        tailBaseWidth: undefined,
        tailFramePosition: undefined,
      },
    });
    expect(latestState?.localSettings.manualPlacement).toBeUndefined();
    expect(latestState?.localSettings.tailBasePosition).toBeUndefined();
    expect(latestState?.localSettings.tailBaseWidth).toBeUndefined();
    expect(latestState?.localSettings.tailFramePosition).toBeUndefined();
    cleanup();
  });

  it('cancels an open history transaction when the popover unmounts mid-session', () => {
    const cancelTransactionSpy = vi.spyOn(pagePreparationHistory, 'cancelTransaction');

    renderHarness(true);

    act(() => {
      root?.unmount();
    });

    root = null;

    expect(cancelTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');
  });
});
