// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepBadgeManualPlacement } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { useStepBadgeBoundaryDrag } from './drag';

let host: HTMLDivElement;
let root: Root;
const onPositionChange = vi.fn<(placement: StepBadgeManualPlacement) => void>();

function createPointerEvent(
  type: string,
  init: { clientX: number; clientY: number; pointerId: number }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  return event;
}

function Harness() {
  const drag = useStepBadgeBoundaryDrag({
    frameRect: { height: 120, width: 200, x: 100, y: 80 },
    initialPlacement: { position: 0.25, side: 'top' },
    onPositionChange,
  });
  return (
    <button
      type="button"
      data-draft={drag.draftPlacement ? JSON.stringify(drag.draftPlacement) : ''}
      onPointerDown={drag.handlePointerDown}
      onKeyDown={drag.handleKeyDown}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('useStepBadgeBoundaryDrag', () => {
  it('renders live constrained geometry and commits only once on release', () => {
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 150, clientY: 80, pointerId: 7 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 220, clientY: 40, pointerId: 7 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 240, clientY: 42, pointerId: 7 })
      )
    );

    expect(onPositionChange).not.toHaveBeenCalled();
    expect(handle.dataset['draft']).toContain('"side":"top"');

    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointerup', { clientX: 240, clientY: 42, pointerId: 7 })
      )
    );

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith({ position: 0.7, side: 'top' });
  });

  it('rolls the draft back on Escape without committing history', () => {
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 150, clientY: 80, pointerId: 8 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 270, clientY: 50, pointerId: 8 })
      )
    );
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));

    expect(onPositionChange).not.toHaveBeenCalled();
    expect(handle.dataset['draft']).toBe('');
  });
});
