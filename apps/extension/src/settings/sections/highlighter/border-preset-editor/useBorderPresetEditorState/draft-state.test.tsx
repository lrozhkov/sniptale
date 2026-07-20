// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetDraftState, useBorderPresetDraftSetters } from './draft-state';

type DraftState = ReturnType<typeof useBorderPresetDraftState>;

let container: HTMLDivElement | null = null;
let latestDraft: DraftState | null = null;
let root: Root | null = null;

function DraftStateHarness() {
  const draft = useBorderPresetDraftState();
  useBorderPresetDraftSetters(draft);

  useEffect(() => {
    latestDraft = draft;
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
    root?.render(<DraftStateHarness />);
  });
}

function getDraft() {
  if (!latestDraft) {
    throw new Error('Draft state is not ready');
  }

  return latestDraft;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestDraft = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useBorderPresetDraftState', () => {
  it('initializes the default draft state and updates fields', async () => {
    await renderHarness();

    expect(getDraft().name).toBe('');
    expect(getDraft().width).toBe(3);

    act(() => {
      getDraft().setName('Border');
      getDraft().setWidth(9);
    });

    expect(getDraft().name).toBe('Border');
    expect(getDraft().width).toBe(9);
  });
});
