// @vitest-environment jsdom

import { act, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetResize } from './resize';
import { useBorderPresetDraftState } from './draft-state';

let container: HTMLDivElement | null = null;
let latestResizeStart: ReturnType<typeof useBorderPresetResize> | null = null;
let latestIsResizing = false;
let latestTextareaHeight = 0;
let root: Root | null = null;

function Harness() {
  const draft = useBorderPresetDraftState();
  const handleResizeStart = useBorderPresetResize({ ...draft, isOpen: true });

  useEffect(() => {
    latestResizeStart = handleResizeStart;
    latestIsResizing = draft.isResizing;
    latestTextareaHeight = draft.textareaHeight;
  });

  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
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
  latestResizeStart = null;
  latestIsResizing = false;
  latestTextareaHeight = 0;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useBorderPresetResize', () => {
  it('clamps height updates and clears listeners on mouseup', async () => {
    await renderHarness();

    act(() => {
      latestResizeStart?.({
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 500 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(latestIsResizing).toBe(false);
    expect(latestTextareaHeight).toBe(300);
  });
});
