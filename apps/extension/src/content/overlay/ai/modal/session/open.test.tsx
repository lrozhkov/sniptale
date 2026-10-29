// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAIModalOpenBootstrapEffect } from './open';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const setPrompt = vi.fn();
const focus = vi.fn();
function Surface({ prompt = '', isOpen = true }: { prompt?: string; isOpen?: boolean }) {
  const bootedWhileOpenRef = useRef(false);
  useAIModalOpenBootstrapEffect({
    bootedWhileOpenRef,
    isOpen,
    lastPrompt: 'stored prompt',
    prompt,
    setPrompt,
    textareaRef: { current: { focus } as unknown as HTMLTextAreaElement },
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('restores the prompt and focuses once during one open lifetime', async () => {
  await act(async () => root.render(<Surface />));
  await act(async () => vi.runAllTimers());
  expect(setPrompt).toHaveBeenCalledWith('stored prompt');
  expect(focus).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Surface />));
  await act(async () => vi.runAllTimers());
  expect(focus).toHaveBeenCalledTimes(1);
});
it('preserves an existing prompt and cancels focus after close', async () => {
  await act(async () => root.render(<Surface prompt="draft" />));
  await act(async () => root.render(<Surface prompt="draft" isOpen={false} />));
  await act(async () => vi.runAllTimers());
  expect(setPrompt).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});
