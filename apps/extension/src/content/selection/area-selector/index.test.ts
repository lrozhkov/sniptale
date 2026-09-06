// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    surface: {
      createSelectionElement: appendSelectionElement,
      hideSelectionElement: (element) => {
        if (element) element.style.display = 'none';
      },
      removeSelectionElement: (element) => element.remove(),
      removeSelectionTooltip: vi.fn(),
      showSelectionElement: (element, origin) => {
        element.style.left = `${origin.startX}px`;
        element.style.top = `${origin.startY}px`;
        element.style.display = 'block';
      },
      showSelectionTooltip: vi.fn(),
      updateSelectionBox: vi.fn(),
    },
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

function createSelectionResultMock() {
  return vi.fn((args: { endX: number; endY: number; startX: number; startY: number }) => ({
    area: {
      x: args.startX,
      y: args.startY,
      width: args.endX - args.startX,
      height: args.endY - args.startY,
    },
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('createAreaSelectionController completion', () => {
  it('continues the drag before a host document guard can cancel mouse events', () => {
    const updateSelectionBox = vi.fn();
    const hostGuard = (event: Event) => event.stopImmediatePropagation();
    document.addEventListener('mousedown', hostGuard, { capture: true });
    document.addEventListener('mousemove', hostGuard, { capture: true });
    const controller = createSelectionController({
      surface: {
        createSelectionElement: appendSelectionElement,
        hideSelectionElement: vi.fn(),
        removeSelectionElement: (element) => element.remove(),
        removeSelectionTooltip: vi.fn(),
        showSelectionElement: vi.fn(),
        showSelectionTooltip: vi.fn(),
        updateSelectionBox,
      },
    });

    try {
      void controller.startAreaSelection();
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 12 })
      );
      document.body.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 92 })
      );
    } finally {
      controller.stopAreaSelection();
      document.removeEventListener('mousedown', hostGuard, { capture: true });
      document.removeEventListener('mousemove', hostGuard, { capture: true });
    }

    expect(updateSelectionBox).toHaveBeenCalledOnce();
  });

  it('resolves a selection and clears listeners after mouseup', async () => {
    const updateSelectionBox = vi.fn();
    const createSelectionResult = createSelectionResultMock();
    const controller = createSelectionController({
      result: { createSelectionResult },
      surface: {
        createSelectionElement: appendSelectionElement,
        hideSelectionElement: vi.fn(),
        removeSelectionElement: (element) => element.remove(),
        removeSelectionTooltip: vi.fn(),
        showSelectionElement: vi.fn(),
        showSelectionTooltip: vi.fn(),
        updateSelectionBox,
      },
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
    expect(createSelectionResult).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 180 }));
    expect(updateSelectionBox).toHaveBeenCalledTimes(1);
  });

  it('rejects an error outcome and clears listeners after mouseup', async () => {
    const updateSelectionBox = vi.fn();
    const createSelectionResult = vi.fn(() => ({ error: new Error('selection too small') }));
    const controller = createSelectionController({
      result: { createSelectionResult },
      surface: {
        createSelectionElement: appendSelectionElement,
        hideSelectionElement: vi.fn(),
        removeSelectionElement: (element) => element.remove(),
        removeSelectionTooltip: vi.fn(),
        showSelectionElement: vi.fn(),
        showSelectionTooltip: vi.fn(),
        updateSelectionBox,
      },
    });

    const pendingSelection = controller.startAreaSelection();
    dispatchSelectionGesture({
      start: { x: 15, y: 20 },
      move: { x: 18, y: 24 },
      end: { x: 20, y: 25 },
    });

    await expect(pendingSelection).rejects.toThrow('selection too small');
    expect(createSelectionResult).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 50 }));
    expect(updateSelectionBox).toHaveBeenCalledTimes(1);
  });
});

describe('createAreaSelectionController cleanup', () => {
  it('rejects on timeout and stops listening after cleanup', async () => {
    vi.useFakeTimers();
    const hideSelectionElement = vi.fn();
    const removeSelectionTooltip = vi.fn();
    const controller = createSelectionController({
      surface: {
        createSelectionElement: appendSelectionElement,
        hideSelectionElement,
        removeSelectionElement: (element) => element.remove(),
        removeSelectionTooltip,
        showSelectionElement: vi.fn(),
        showSelectionTooltip: vi.fn(),
        updateSelectionBox: vi.fn(),
      },
    });

    const pendingSelection = controller.startAreaSelection();
    dispatchSelectionGesture({ start: { x: 10, y: 12 } });
    vi.runAllTimers();

    await expect(pendingSelection).rejects.toThrow();
    expect(hideSelectionElement).toHaveBeenCalledTimes(1);
    expect(removeSelectionTooltip).toHaveBeenCalledTimes(2);
  });

  it('removes the mounted selection element when stopped explicitly', () => {
    const controller = createSelectionController();

    void controller.startAreaSelection();
    expect(document.querySelector('div')).not.toBeNull();

    controller.stopAreaSelection();

    expect(document.querySelector('div')).toBeNull();
  });
});
