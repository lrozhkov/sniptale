// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveFrameToolbarEffectButtons } from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function hasKeySpreadWarning(calls: readonly (readonly unknown[])[]) {
  return calls.some((call) =>
    call.some((item) =>
      String(item).includes('A props object containing a "key" prop is being spread into JSX')
    )
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InteractiveFrameToolbarEffectButtons', () => {
  it('passes React keys directly instead of spreading them through button props', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root?.render(
        <InteractiveFrameToolbarEffectButtons
          effectMode="border"
          popoverAnchorRef={React.createRef<HTMLButtonElement>()}
          handleButtonMouseDown={vi.fn()}
          handleEffectClick={() => vi.fn()}
          effectButtons={[
            { mode: 'border', label: 'Border' },
            { mode: 'blur', label: 'Blur' },
            { mode: 'focus', label: 'Focus' },
          ]}
        />
      );
    });

    expect(hasKeySpreadWarning(consoleErrorSpy.mock.calls)).toBe(false);
  });
});
