// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepBadgeManualPlacement } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { FrameAnnotationCoordinateSpace } from '../../../features/highlighter/frame-annotation/coordinate-space';
import { useStepBadgeBoundaryDrag } from '../../../features/highlighter/frame-annotation/step-badge/drag';

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

const initialPlacement: StepBadgeManualPlacement = { position: 0.25, side: 'top' };

function Harness(props: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  initialPlacement: StepBadgeManualPlacement;
  visualOffset?: { x: number; y: number };
  visualScale?: number;
}) {
  const drag = useStepBadgeBoundaryDrag({
    ...(props.coordinateSpace ? { coordinateSpace: props.coordinateSpace } : {}),
    frameRect: { height: 120, width: 200, x: 100, y: 80 },
    initialPlacement: props.initialPlacement,
    onPositionChange,
    visualOffset: props.visualOffset ?? { x: 0, y: 0 },
    ...(props.visualScale === undefined ? {} : { visualScale: props.visualScale }),
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
  act(() => root.render(<Harness initialPlacement={initialPlacement} />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('useStepBadgeBoundaryDrag perimeter switching', () => {
  it('crosses frame corners and commits to the nearest perimeter side', () => {
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 150, clientY: 80, pointerId: 13 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 320, clientY: 140, pointerId: 13 })
      )
    );

    expect(JSON.parse(handle.dataset['draft'] ?? '{}')).toEqual({
      normalOffset: 20,
      position: 0.5,
      side: 'right',
    });

    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointerup', { clientX: 320, clientY: 140, pointerId: 13 })
      )
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      normalOffset: 20,
      position: 0.5,
      side: 'right',
    });
  });

  it('preserves an off-center grab while moving diagonally away from a frame corner', () => {
    act(() => root.render(<Harness initialPlacement={{ position: 1, side: 'top' }} />));
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 286, clientY: 94, pointerId: 14 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 306, clientY: 114, pointerId: 14 })
      )
    );

    expect(JSON.parse(handle.dataset['draft'] ?? '{}')).toEqual({
      normalOffset: 20,
      position: 0.1667,
      side: 'right',
    });
  });

  it('keeps a badge diagonally outside a corner on both pointer axes', () => {
    act(() => root.render(<Harness initialPlacement={{ position: 1, side: 'top' }} />));
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 300, clientY: 80, pointerId: 15 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 320, clientY: 60, pointerId: 15 })
      )
    );

    expect(JSON.parse(handle.dataset['draft'] ?? '{}')).toEqual({
      normalOffset: 20,
      position: 1,
      side: 'top',
      tangentialOffset: 20,
    });
  });
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
    expect(onPositionChange).toHaveBeenCalledWith({
      normalOffset: 38,
      position: 0.7,
      side: 'top',
    });
    expect(handle.dataset['draft']).toContain('"position":0.7');

    act(() => root.render(<Harness initialPlacement={{ position: 0.7, side: 'top' }} />));
    expect(handle.dataset['draft']).toBe('');
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

  it('subtracts the configured visual offset while projecting pointer movement', () => {
    act(() =>
      root.render(<Harness initialPlacement={initialPlacement} visualOffset={{ x: 20, y: -10 }} />)
    );
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 170, clientY: 70, pointerId: 9 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 170, clientY: 70, pointerId: 9 })
      )
    );
    expect(handle.dataset['draft']).toContain('"position":0.25');

    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 240, clientY: 70, pointerId: 9 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointerup', { clientX: 240, clientY: 70, pointerId: 9 })
      )
    );

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith({ position: 0.6, side: 'top' });
  });

  it('moves horizontal and vertical placements from the keyboard and ignores other keys', () => {
    const handle = host.querySelector('button') as HTMLButtonElement;

    act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
    expect(onPositionChange).not.toHaveBeenCalled();

    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({ position: 0.255, side: 'top' });

    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }))
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      normalOffset: 1,
      position: 0.25,
      side: 'top',
    });

    act(() => root.render(<Harness initialPlacement={{ position: 0.5, side: 'left' }} />));
    act(() =>
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', shiftKey: true })
      )
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      position: 0.5833333333333334,
      side: 'left',
    });
    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }))
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      position: 0.49166666666666664,
      side: 'left',
    });
  });

  it('keeps pointer and keyboard normal offsets in CSS pixels at non-unit scale', () => {
    act(() =>
      root.render(
        <Harness
          initialPlacement={{ normalOffset: 20, position: 0.25, side: 'top' }}
          visualScale={0.5}
        />
      )
    );
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();

    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 150, clientY: 60, pointerId: 12 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 170, clientY: 50, pointerId: 12 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointerup', { clientX: 170, clientY: 50, pointerId: 12 })
      )
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      normalOffset: 30,
      position: 0.35,
      side: 'top',
    });

    act(() =>
      root.render(
        <Harness
          initialPlacement={{ normalOffset: 20, position: 0.25, side: 'top' }}
          visualScale={0.5}
        />
      )
    );
    act(() =>
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp', shiftKey: true })
      )
    );
    expect(onPositionChange).toHaveBeenLastCalledWith({
      normalOffset: 30,
      position: 0.25,
      side: 'top',
    });
  });

  it('ignores non-primary pointer starts and projects client coordinates through the adapter', () => {
    const handle = host.querySelector('button') as HTMLButtonElement;
    handle.setPointerCapture = vi.fn(() => {
      throw new Error('portal removed');
    });
    const secondary = createPointerEvent('pointerdown', {
      clientX: 140,
      clientY: 80,
      pointerId: 10,
    });
    Object.defineProperty(secondary, 'button', { value: 1 });
    act(() => handle.dispatchEvent(secondary));
    expect(handle.dataset['draft']).toBe('');

    act(() =>
      root.render(
        <Harness
          coordinateSpace={{
            viewport: { height: 400, width: 600 },
            clientPointToLogical: ({ x, y }) => ({ x: x + 100, y: y + 40 }),
            clientRectToLogical: (rect) => rect,
            logicalPointToClient: ({ x, y }) => ({ x: x - 100, y: y - 40 }),
            logicalRectToClient: (rect) => rect,
          }}
          initialPlacement={initialPlacement}
        />
      )
    );
    act(() =>
      handle.dispatchEvent(
        createPointerEvent('pointerdown', { clientX: 20, clientY: 40, pointerId: 11 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointermove', { clientX: 100, clientY: 40, pointerId: 11 })
      )
    );
    act(() =>
      document.dispatchEvent(
        createPointerEvent('pointerup', { clientX: 100, clientY: 40, pointerId: 11 })
      )
    );

    expect(onPositionChange).toHaveBeenLastCalledWith({ position: 0.65, side: 'top' });
  });
});
