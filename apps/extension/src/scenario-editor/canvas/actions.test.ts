import { expect, it, vi } from 'vitest';
import {
  createScenarioLineElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createBeginInteractionHandler,
  createClearInteractionHandler,
  createCommitInteractionHandler,
  createKeyboardInteractionHandler,
  createPreviewInteractionHandler,
} from './actions';
import { resolveScenarioCanvasGuides } from './guides';
import type { ScenarioCanvasMagnetScope } from './magnet';
import type { InteractionSessionSnapshot } from './patches';
import {
  createScenarioCanvasMarqueeFrame,
  doesScenarioFrameIntersect,
  getScenarioCanvasPointFromClient,
} from './viewport';

function createMagnetScope(): ScenarioCanvasMagnetScope {
  const active = {
    ...createScenarioTextElement({
      frame: { height: 30, width: 50, x: 100, y: 100 },
    }),
    id: 'active',
  };
  const sibling = {
    ...createScenarioTextElement({
      frame: { height: 60, width: 120, x: 160, y: 100 },
    }),
    id: 'sibling',
  };

  return {
    elements: [active, sibling],
    slide: { height: 480, width: 640 },
  };
}

function createEmptyInteractionSnapshot(): InteractionSessionSnapshot {
  return {
    dragSession: null,
    endpointSession: null,
    imageContentSession: null,
    resizeSession: null,
  };
}

function createRenderedElement(element: ScenarioElement): ScenarioRenderedElement {
  const frame = element.frame;
  return {
    box: {
      ...frame,
      centerX: frame.x + frame.width / 2,
      centerY: frame.y + frame.height / 2,
    },
    element,
    kind: element.kind,
    selected: false,
  } as ScenarioRenderedElement;
}

it('uses shared canvas geometry for pointer coordinates and marquee hit testing', () => {
  const point = getScenarioCanvasPointFromClient({
    clientX: 330,
    clientY: 260,
    scale: 0.5,
    stageRect: { left: 30, top: 20 },
  });

  expect(point).toEqual({ x: 600, y: 480 });
  expect(createScenarioCanvasMarqueeFrame({ x: 300, y: 260 }, point)).toEqual({
    height: 220,
    width: 300,
    x: 300,
    y: 260,
  });
  expect(
    doesScenarioFrameIntersect(
      { height: 80, width: 120, x: 280, y: 240 },
      { height: 60, width: 90, x: 340, y: 280 }
    )
  ).toBe(true);
});

it('begins and clears interaction transactions through the session owner', () => {
  const element = createMagnetScope().elements[0]!;
  const onTransactionBegin = vi.fn();
  const onTransactionCommit = vi.fn();
  const resetInteractionState = vi.fn();
  const setTransactionKind = vi.fn();
  const snapshot = createEmptyInteractionSnapshot();
  snapshot.dragSession = { element, originClientX: 0, originClientY: 0 };

  createBeginInteractionHandler({ onTransactionBegin, setTransactionKind })(
    snapshot.dragSession,
    'move'
  );
  createClearInteractionHandler({
    onTransactionCancel: undefined,
    onTransactionCommit,
    resetInteractionState,
    snapshot,
    transactionKind: 'move',
  })(true);

  expect(onTransactionBegin).toHaveBeenCalledWith('active', 'move');
  expect(setTransactionKind).toHaveBeenCalledWith('move');
  expect(onTransactionCommit).toHaveBeenCalledWith('active', 'move');
  expect(resetInteractionState).toHaveBeenCalledOnce();
});

it('keeps inert preview and empty commit paths explicit', () => {
  const clearInteraction = vi.fn();
  const onUpdateElement = vi.fn();
  const setPreviewFrame = vi.fn();
  const snapshot = createEmptyInteractionSnapshot();

  createPreviewInteractionHandler({
    magnetScope: null,
    scale: 1,
    setPreviewFrame,
    snapGridSize: null,
    snapshot,
  })({ clientX: 10, clientY: 10 } as never);
  createCommitInteractionHandler({
    clearInteraction,
    magnetScope: null,
    onUpdateElement,
    previewFrame: null,
    scale: 1,
    snapGridSize: null,
    snapshot,
  })({ clientX: 10, clientY: 10 } as never);

  expect(setPreviewFrame).not.toHaveBeenCalled();
  expect(onUpdateElement).not.toHaveBeenCalled();
  expect(clearInteraction).toHaveBeenCalledWith(false);
});

it('routes keyboard escape and selected element mutations through action callbacks', () => {
  const clearInteraction = vi.fn();
  const onDeleteElement = vi.fn();
  const onSelectSlide = vi.fn();
  const onUpdateElement = vi.fn();
  const selectedElement = createMagnetScope().elements[0]!;
  const handler = createKeyboardInteractionHandler({
    clearInteraction,
    onDeleteElement,
    onSelectSlide,
    onUpdateElement,
    selectedElement,
  });

  handler({ key: 'ArrowRight', preventDefault: vi.fn(), shiftKey: false } as never);
  handler({ key: 'Delete', preventDefault: vi.fn(), shiftKey: false } as never);
  handler({ key: 'Escape', preventDefault: vi.fn(), shiftKey: false } as never);

  expect(onUpdateElement).toHaveBeenCalledWith('active', {
    frame: expect.objectContaining({ x: 101 }),
  });
  expect(onDeleteElement).toHaveBeenCalledWith('active');
  expect(clearInteraction).toHaveBeenCalledWith(false);
  expect(onSelectSlide).toHaveBeenCalledOnce();
});

it('previews resize patches through magnet alignment before grid fallback', () => {
  const magnetScope = createMagnetScope();
  const setPreviewFrame = vi.fn();
  const snapshot = createEmptyInteractionSnapshot();
  snapshot.resizeSession = {
    element: magnetScope.elements[0]!,
    handle: 'se',
    originClientX: 0,
    originClientY: 0,
  };

  createPreviewInteractionHandler({
    magnetScope,
    scale: 1,
    setPreviewFrame,
    snapGridSize: 32,
    snapshot,
  })({ clientX: 9, clientY: 0 } as never);

  expect(setPreviewFrame).toHaveBeenCalledWith({ height: 30, width: 60, x: 100, y: 100 });
});

it('previews drag patches and resolves matching canvas guides through shared guide lines', () => {
  const magnetScope = createMagnetScope();
  const setPreviewFrame = vi.fn();
  const snapshot = createEmptyInteractionSnapshot();
  snapshot.dragSession = {
    element: magnetScope.elements[0]!,
    originClientX: 0,
    originClientY: 0,
  };

  createPreviewInteractionHandler({
    magnetScope,
    scale: 1,
    setPreviewFrame,
    snapGridSize: null,
    snapshot,
  })({ clientX: 10, clientY: 0 } as never);

  expect(setPreviewFrame).toHaveBeenCalledWith({ height: 30, width: 50, x: 110, y: 100 });
  expect(
    resolveScenarioCanvasGuides({
      activeElementId: 'active',
      frame: { height: 30, width: 60, x: 100, y: 100 },
      renderedElements: magnetScope.elements.map(createRenderedElement),
      slide: magnetScope.slide,
    })
  ).toContainEqual({ axis: 'horizontal', position: 100 });
  expect(
    resolveScenarioCanvasGuides({
      activeElementId: 'active',
      frame: null,
      renderedElements: [],
      slide: magnetScope.slide,
    })
  ).toEqual([]);
});

it('commits endpoint patches through magnet alignment before grid fallback', () => {
  const magnetScope = createMagnetScope();
  const line = {
    ...createScenarioLineElement({
      end: { x: 100, y: 100 },
      frame: { height: 80, width: 120, x: 80, y: 80 },
      start: { x: 20, y: 20 },
    }),
    id: 'active',
  };
  const clearInteraction = vi.fn();
  const onUpdateElement = vi.fn();
  const snapshot = createEmptyInteractionSnapshot();
  snapshot.endpointSession = {
    element: line,
    handle: 'end',
    originClientX: 0,
    originClientY: 0,
  };

  createCommitInteractionHandler({
    clearInteraction,
    magnetScope,
    onUpdateElement,
    previewFrame: null,
    scale: 1,
    snapGridSize: 32,
    snapshot,
  })({ clientX: 59, clientY: 0 } as never);

  expect(onUpdateElement).toHaveBeenCalledWith('active', { end: { x: 160, y: 100 } });
  expect(clearInteraction).toHaveBeenCalledWith(true);
});

it('commits image content pan patches through the shared pointer session coordinates', () => {
  const clearInteraction = vi.fn();
  const onUpdateElement = vi.fn();
  const element = {
    ...createScenarioTextElement({
      frame: { height: 30, width: 50, x: 100, y: 100 },
    }),
    id: 'active',
  };
  const snapshot = createEmptyInteractionSnapshot();
  snapshot.imageContentSession = {
    contentTransform: { scale: 1, x: 5, y: 6 },
    element,
    originClientX: 10,
    originClientY: 20,
  };

  createCommitInteractionHandler({
    clearInteraction,
    magnetScope: null,
    onUpdateElement,
    previewFrame: null,
    scale: 2,
    snapGridSize: null,
    snapshot,
  })({ clientX: 14, clientY: 26 } as never);

  expect(onUpdateElement).toHaveBeenCalledWith('active', {
    contentTransform: { scale: 1, x: 7, y: 9 },
  });
  expect(clearInteraction).toHaveBeenCalledWith(true);
});
