// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetDraftValues } from './draft-values';

type DraftValues = ReturnType<typeof useBorderPresetDraftValues>;

let container: HTMLDivElement | null = null;
let latestValues: DraftValues | null = null;
let root: Root | null = null;

function Harness() {
  const values = useBorderPresetDraftValues();

  useEffect(() => {
    latestValues = values;
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

function getValues() {
  if (!latestValues) {
    throw new Error('Draft values are not ready');
  }

  return latestValues;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestValues = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useBorderPresetDraftValues', () => {
  it('initializes the default values for a new preset draft', async () => {
    await renderHarness();

    expect(getValues().name).toBe('');
    expect(getValues().width).toBe(3);
    expect(getValues().shadow).toBe(0);
  });
});
