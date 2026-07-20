// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useVideoActiveCountdown } from './countdown';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue = 0;

function CountdownHarness(props: { countdownEndsAt: number | null }) {
  latestValue = useVideoActiveCountdown(props.countdownEndsAt);
  return null;
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-26T09:00:00.000Z'));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('tracks the remaining countdown seconds and clamps at zero', async () => {
  await renderNode(<CountdownHarness countdownEndsAt={Date.now() + 1_500} />);

  expect(latestValue).toBe(2);

  await act(async () => {
    vi.advanceTimersByTime(1_500);
  });

  expect(latestValue).toBe(0);
});

it('returns zero when no countdown is active', async () => {
  await renderNode(<CountdownHarness countdownEndsAt={null} />);

  expect(latestValue).toBe(0);
});
