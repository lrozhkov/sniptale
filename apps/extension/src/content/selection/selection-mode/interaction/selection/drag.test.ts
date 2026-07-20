import { afterEach, describe, expect, it, vi } from 'vitest';
import * as selectionUi from '../../ui';
import { finalizeDragSelection, handleDragMove, updateDragSelection } from './drag';
import type { SelectionModeDom } from '../../ui/dom-types';

const originalDocument = globalThis.document;

function createSelectionModeDom(overrides: Partial<SelectionModeDom> = {}): SelectionModeDom {
  return {
    overlayContainer: null,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
    ...overrides,
  };
}

function stubDocumentBodyStyles(): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        style: {
          userSelect: '',
          webkitUserSelect: '',
        },
      },
    },
  });
}

function expectNormalizedSelectionRectangle() {
  const result = updateDragSelection({ x: 160, y: 120 }, 80, 40);

  expect(result).toEqual({ x: 80, y: 40, width: 80, height: 80 });
}

function expectSelectionMoveRelativeToDragStart() {
  const result = handleDragMove({ x: 120, y: 90, width: 140, height: 100 }, { x: 200, y: 180 }, {
    clientX: 240,
    clientY: 130,
  } as MouseEvent);

  expect(result).toEqual({ x: 160, y: 40, width: 140, height: 100 });
}

function expectIdleStateForSmallSelection() {
  stubDocumentBodyStyles();

  const dragFrame = {
    style: {
      display: 'block',
    },
  } as HTMLElement;

  const result = finalizeDragSelection({
    dom: createSelectionModeDom({ dragFrame }),
    currentSelection: { x: 10, y: 20, width: 4, height: 8 },
    minSelectionSize: 10,
  });

  expect(dragFrame.style.display).toBe('none');
  expect(result).toEqual({
    shouldShowFinalFrame: false,
    currentState: 'idle',
    aspectRatio: null,
    skipNextClick: false,
  });
}

function expectBodySelectionResetAfterCleanupFailure() {
  stubDocumentBodyStyles();
  const removeDragEventCatcherSpy = vi
    .spyOn(selectionUi, 'removeDragEventCatcher')
    .mockImplementation(() => {
      throw new Error('cleanup failed');
    });

  expect(() =>
    finalizeDragSelection({
      dom: createSelectionModeDom(),
      currentSelection: { x: 10, y: 20, width: 20, height: 20 },
      minSelectionSize: 10,
    })
  ).toThrow('cleanup failed');
  expect(document.body.style.userSelect).toBe('');
  expect(document.body.style.webkitUserSelect).toBe('');

  removeDragEventCatcherSpy.mockRestore();
}

describe('selection-mode drag interactions', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  });

  it(
    'normalizes the selection rectangle when the pointer crosses the drag origin',
    expectNormalizedSelectionRectangle
  );
  it(
    'moves the whole selection relative to the drag start point',
    expectSelectionMoveRelativeToDragStart
  );
  it(
    'returns to idle when the dragged selection is below the minimum size',
    expectIdleStateForSmallSelection
  );
  it(
    'restores body selection styles even when drag-event cleanup throws',
    expectBodySelectionResetAfterCleanupFailure
  );
});
