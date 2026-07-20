// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createActionsSpy, useSectionStateSpy } = vi.hoisted(() => ({
  createActionsSpy: vi.fn(),
  useSectionStateSpy: vi.fn(),
}));

vi.mock('./actions', () => ({
  createHighlighterSectionActions: (state: unknown) => createActionsSpy(state),
}));

vi.mock('./state', () => ({
  useHighlighterSectionState: () => useSectionStateSpy(),
}));

import { useHighlighterSection } from './useHighlighterSection';

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useHighlighterSection> | null = null;
let root: Root | null = null;

function HighlighterSectionHarness() {
  latestState = useHighlighterSection();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterSectionHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  createActionsSpy.mockReset();
  useSectionStateSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useHighlighterSection', () => {
  it('merges state and action owners into a single section model', async () => {
    const state = {
      isLoading: false,
      settings: { enabled: true },
      setSettings: vi.fn(),
    };
    const actions = {
      handleAddPreset: vi.fn(),
      handleSetDefaultPreset: vi.fn(),
    };

    useSectionStateSpy.mockReturnValue(state);
    createActionsSpy.mockReturnValue(actions);

    await renderHarness();

    expect(createActionsSpy).toHaveBeenCalledWith(state);
    expect(latestState).toEqual({
      ...state,
      ...actions,
    });
  });
});
