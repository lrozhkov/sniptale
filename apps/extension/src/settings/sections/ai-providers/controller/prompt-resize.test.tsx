// @vitest-environment jsdom
import type React from 'react';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAiProvidersPromptResize } from './prompt-resize';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestResizeHandler: ReturnType<typeof useAiProvidersPromptResize> | null = null;
let latestDetachedResizeHandler: ReturnType<typeof useAiProvidersPromptResize> | null = null;

function PromptResizeHarness() {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  latestResizeHandler = useAiProvidersPromptResize(promptRef);
  return <textarea ref={promptRef} />;
}

function DetachedPromptResizeHarness() {
  latestDetachedResizeHandler = useAiProvidersPromptResize({
    current: null,
  } as React.RefObject<HTMLTextAreaElement | null>);
  return null;
}

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestResizeHandler = null;
  latestDetachedResizeHandler = null;
  vi.unstubAllGlobals();
});

it('resizes the prompt textarea while dragging and removes listeners on mouseup', async () => {
  await renderUi(<PromptResizeHarness />);

  const textarea = container?.querySelector('textarea');
  if (!textarea) {
    throw new Error('Expected textarea to be rendered');
  }

  Object.defineProperty(textarea, 'clientHeight', {
    configurable: true,
    value: 140,
  });

  const preventDefault = vi.fn();
  act(() => {
    latestResizeHandler?.({
      clientY: 60,
      preventDefault,
    } as unknown as React.MouseEvent);
  });

  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 120 }));
  });

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(textarea.style.height).toBe('200px');

  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup'));
  });

  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 180 }));
  });

  expect(textarea.style.height).toBe('200px');
});

it('returns early when the prompt ref is not attached', async () => {
  await renderUi(<DetachedPromptResizeHarness />);

  const preventDefault = vi.fn();

  expect(() => {
    act(() => {
      latestDetachedResizeHandler?.({
        clientY: 40,
        preventDefault,
      } as unknown as React.MouseEvent);
    });
  }).not.toThrow();

  expect(preventDefault).toHaveBeenCalledTimes(1);
});

it('keeps the controller resize floor at 100px when dragging upward', async () => {
  await renderUi(<PromptResizeHarness />);

  const textarea = container?.querySelector('textarea');
  if (!textarea) {
    throw new Error('Expected textarea to be rendered');
  }

  Object.defineProperty(textarea, 'clientHeight', {
    configurable: true,
    value: 110,
  });

  act(() => {
    latestResizeHandler?.({
      clientY: 60,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent);
  });

  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
  });

  expect(textarea.style.height).toBe('100px');
});
