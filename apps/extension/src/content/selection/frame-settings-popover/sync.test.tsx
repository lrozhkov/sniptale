// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { dispatchHighlighterModeChanged } from '../../platform/page-context/mode-events';
import { useFrameSettingsPopoverModeClose } from './sync';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let onCloseSpy: Mock<() => void> | null = null;

function renderHarness(isOpen: boolean) {
  onCloseSpy = vi.fn<() => void>();

  function Harness() {
    useFrameSettingsPopoverModeClose({
      isOpen,
      onClose: () => onCloseSpy?.(),
    });
    return null;
  }

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
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  onCloseSpy = null;
});

describe('useFrameSettingsPopoverModeClose', () => {
  it('closes the popover when highlighter mode changes while open', () => {
    renderHarness(true);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the popover open when highlighter mode stays enabled', () => {
    renderHarness(true);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: true });
    });

    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it('does not subscribe when the popover is closed', () => {
    renderHarness(false);

    act(() => {
      dispatchHighlighterModeChanged({ enabled: false });
    });

    expect(onCloseSpy).not.toHaveBeenCalled();
  });
});
