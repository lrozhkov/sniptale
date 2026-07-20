// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import { createAreaSelectionController } from '.';

function appendSelectionElement(): HTMLDivElement {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
}

function createSelectionController(
  overrides: Partial<Parameters<typeof createAreaSelectionController>[0]> = {}
) {
  return createAreaSelectionController({
    createSelectionElement: appendSelectionElement,
    removeAreaSelectionTooltip: vi.fn(),
    showAreaSelectionTooltip: vi.fn(),
    updateSelectionBox: vi.fn(),
    ...overrides,
  });
}

function dispatchSelectionGesture(points: {
  start: { x: number; y: number };
  move?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  document.dispatchEvent(
    new MouseEvent('mousedown', {
      clientX: points.start.x,
      clientY: points.start.y,
    })
  );

  if (points.move) {
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: points.move.x,
        clientY: points.move.y,
      })
    );
  }

  if (points.end) {
    document.dispatchEvent(
      new MouseEvent('mouseup', {
        clientX: points.end.x,
        clientY: points.end.y,
      })
    );
  }
}

function createCompleteAreaSelectionMock() {
  return vi.fn(
    (args: {
      callback: ((area: SelectedArea) => void) | null;
      cleanup: () => void;
      endX: number;
      endY: number;
      startX: number;
      startY: number;
    }) => {
      args.callback?.({
        x: args.startX,
        y: args.startY,
        width: args.endX - args.startX,
        height: args.endY - args.startY,
      });
      args.cleanup();
    }
  );
}

function createAreaSelectionTimeoutMock() {
  return vi.fn(
    (args: { cleanup: () => void; isSelecting: boolean; reject: (reason?: unknown) => void }) => {
      args.reject(new Error(args.isSelecting ? 'timeout' : 'inactive'));
      args.cleanup();
    }
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('createAreaSelectionController completion', () => {
  it('resolves a selection and clears listeners after mouseup', async () => {
    const updateSelectionBox = vi.fn();
    const completeAreaSelection = createCompleteAreaSelectionMock();
    const controller = createSelectionController({
      completeAreaSelection,
      updateSelectionBox,
    });

    const pendingSelection = controller.startAreaSelection();
    dispatchSelectionGesture({
      start: { x: 15, y: 20 },
      move: { x: 55, y: 80 },
      end: { x: 95, y: 120 },
    });

    await expect(pendingSelection).resolves.toEqual({
      x: 15,
      y: 20,
      width: 80,
      height: 100,
    });
    expect(updateSelectionBox).toHaveBeenCalledTimes(1);
    expect(completeAreaSelection).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 180 }));
    expect(updateSelectionBox).toHaveBeenCalledTimes(1);
  });
});

describe('createAreaSelectionController cleanup', () => {
  it('rejects on timeout and stops listening after cleanup', async () => {
    vi.useFakeTimers();
    const handleAreaSelectionTimeout = createAreaSelectionTimeoutMock();
    const controller = createSelectionController({
      handleAreaSelectionTimeout,
    });

    const pendingSelection = controller.startAreaSelection();
    dispatchSelectionGesture({ start: { x: 10, y: 12 } });
    vi.runAllTimers();

    await expect(pendingSelection).rejects.toThrow('timeout');
    expect(handleAreaSelectionTimeout).toHaveBeenCalledTimes(1);
  });

  it('removes the mounted selection element when stopped explicitly', () => {
    const controller = createSelectionController();

    void controller.startAreaSelection();
    expect(document.querySelector('div')).not.toBeNull();

    controller.stopAreaSelection();

    expect(document.querySelector('div')).toBeNull();
  });
});
