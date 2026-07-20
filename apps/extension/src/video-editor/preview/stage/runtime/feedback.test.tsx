// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { loggerErrorMock } = vi.hoisted(() => ({ loggerErrorMock: vi.fn() }));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}));

import type { PreviewEffectRuntimeFeedback } from '../types';
import { usePreviewEffectRuntimeFeedback } from './feedback';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let feedback: PreviewEffectRuntimeFeedback | null = null;

function renderFeedback(): void {
  function Harness() {
    feedback = usePreviewEffectRuntimeFeedback();
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  feedback = null;
  loggerErrorMock.mockClear();
  renderFeedback();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  feedback = null;
  vi.unstubAllGlobals();
});

it('reports each failing source once until recovery or explicit retry', () => {
  act(() => {
    feedback?.onFailure('visual', new Error('first'));
    feedback?.onFailure('visual', new Error('repeated'));
  });

  expect(loggerErrorMock).toHaveBeenCalledOnce();
  expect(feedback?.failed).toBe(true);

  act(() => feedback?.onRecovery('visual'));
  expect(feedback?.failed).toBe(false);
  act(() => feedback?.onFailure('visual', new Error('after recovery')));
  expect(loggerErrorMock).toHaveBeenCalledTimes(2);

  const retryVersion = feedback?.retryVersion;
  act(() => feedback?.onRetry());
  expect(feedback?.failed).toBe(false);
  expect(feedback?.retryVersion).toBe((retryVersion ?? 0) + 1);
});
