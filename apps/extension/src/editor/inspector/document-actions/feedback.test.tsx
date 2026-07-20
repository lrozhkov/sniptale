// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolvePresetFeedbackState, useDocumentActionFeedback } from './feedback';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let feedback: ReturnType<typeof useDocumentActionFeedback> | null = null;

function Probe() {
  feedback = useDocumentActionFeedback();
  return null;
}

function renderProbe() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Probe />));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  feedback = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('clears pending feedback timeout before the next action and after saved expiry', async () => {
  const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
  renderProbe();

  await act(async () => feedback?.runActionFeedback('first', vi.fn()));
  await act(async () => feedback?.runActionFeedback('second', vi.fn()));

  expect(clearTimeoutSpy).toHaveBeenCalledOnce();
  expect(feedback?.getActionStatus('second')).toBe('saved');

  act(() => vi.advanceTimersByTime(1600));

  expect(feedback?.getActionStatus('second')).toBe('idle');
});

it('resolves save-to-folder feedback state for saved and saving presets', () => {
  expect(resolvePresetFeedbackState(null, null)).toEqual({
    feedbackPresetId: null,
    savingPresetId: null,
  });
  expect(resolvePresetFeedbackState('save-to-folder:preset-1', 'saved')).toEqual({
    feedbackPresetId: 'preset-1',
    savingPresetId: null,
  });
  expect(resolvePresetFeedbackState('save-to-folder:preset-2', 'saving')).toEqual({
    feedbackPresetId: null,
    savingPresetId: 'preset-2',
  });
});
