// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickActionOverlay } from '../../../../../contracts/settings';

import { useContentSurfaceState } from './surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useContentSurfaceState> | null = null;

function Harness() {
  latestState = useContentSurfaceState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

function getLatestState() {
  expect(latestState).not.toBeNull();
  return latestState as ReturnType<typeof useContentSurfaceState>;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('content app mode state handlers', () => {
  it('keeps pending auto-start handlers stable across rerenders', async () => {
    await renderHarness();
    const firstState = getLatestState();

    await renderHarness();
    const secondState = getLatestState();

    expect(secondState.clearPendingAutoStartCapture).toBe(firstState.clearPendingAutoStartCapture);
    expect(secondState.queueAutoStartCapture).toBe(firstState.queueAutoStartCapture);
  });

  it('updates the quick-action overlay ref through the canonical setter', async () => {
    const overlay: QuickActionOverlay = {
      afterCapture: 'copy',
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 100,
    };

    await renderHarness();

    act(() => {
      getLatestState().setQuickActionOverlay(overlay);
    });

    expect(getLatestState().quickActionOverlayRef.current).toEqual(overlay);

    act(() => {
      getLatestState().setQuickActionOverlay(null);
    });

    expect(getLatestState().quickActionOverlayRef.current).toBeNull();
  });
});

describe('content app mode session state', () => {
  it('updates the pin-to-tab UI state without using page window session storage', async () => {
    await renderHarness();

    act(() => {
      getLatestState().setPinToTab(true);
    });

    expect(getLatestState().pinToTab).toBe(true);
    expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();

    act(() => {
      getLatestState().setPinToTab(false);
    });

    expect(getLatestState().pinToTab).toBe(false);
    expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();
  });
});
