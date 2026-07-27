// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetUpdatePadding } from './update-padding';
import type { BorderPresetDraftSetters } from './types';

let container: HTMLDivElement | null = null;
let latestUpdatePadding: ReturnType<typeof useBorderPresetUpdatePadding> | null = null;
let root: Root | null = null;

const setPadding = vi.fn();
const setters: Pick<BorderPresetDraftSetters, 'setPadding'> = {
  setPadding,
};

function Harness() {
  const updatePadding = useBorderPresetUpdatePadding(setters.setPadding);

  useEffect(() => {
    latestUpdatePadding = updatePadding;
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
  setPadding.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestUpdatePadding = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useBorderPresetUpdatePadding', () => {
  it('clamps padding updates into the expected range', async () => {
    await renderHarness();

    act(() => {
      latestUpdatePadding?.('top', 99);
    });

    expect(setPadding).toHaveBeenCalledWith(expect.any(Function));
  });
});
