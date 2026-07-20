// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetDraftSetters } from './draft-setters';
import type { BorderPresetDraftState } from './types';

let container: HTMLDivElement | null = null;
let latestSetters: ReturnType<typeof useBorderPresetDraftSetters> | null = null;
let root: Root | null = null;

const draft: BorderPresetDraftState = {
  color: '#f97316',
  customCss: '',
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  strokeOpacity: 100,
  isResizing: false,
  name: '',
  opacity: 100,
  padding: { top: 3, left: 3, right: 3, bottom: 3 },
  radius: 0,
  shadow: 0,
  style: 'solid',
  textareaHeight: 72,
  width: 3,
  setColor: vi.fn(),
  setCustomCss: vi.fn(),
  setFillColor: vi.fn(),
  setFillOpacity: vi.fn(),
  setInheritCustomCss: vi.fn(),
  setIsResizing: vi.fn(),
  setName: vi.fn(),
  setOpacity: vi.fn(),
  setPadding: vi.fn(),
  setRadius: vi.fn(),
  setShadow: vi.fn(),
  setStyle: vi.fn(),
  setTextareaHeight: vi.fn(),
  setStrokeOpacity: vi.fn(),
  setWidth: vi.fn(),
};

function Harness() {
  const setters = useBorderPresetDraftSetters(draft);

  useEffect(() => {
    latestSetters = setters;
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
  latestSetters = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useBorderPresetDraftSetters', () => {
  it('passes through the setter contract unchanged', async () => {
    await renderHarness();

    expect(latestSetters?.setName).toBe(draft.setName);
    expect(latestSetters?.setWidth).toBe(draft.setWidth);
    expect(latestSetters?.setCustomCss).toBe(draft.setCustomCss);
  });
});
