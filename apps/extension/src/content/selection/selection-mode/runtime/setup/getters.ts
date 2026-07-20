import type { SelectionModeMutableRefs } from '../../session/locals-contract';
import { mergeSelectionModeMutableRefGetters } from './shared';
import type { MutableRefGetterArgs } from './types';

function createSelectionModeMutableRefCoreGetters(args: MutableRefGetterArgs) {
  return {
    get aspectRatio() {
      return args.getAspectRatio();
    },
    get cleanupEventListeners() {
      return args.getCleanupEventListeners();
    },
    get cleanupScrollListeners() {
      return args.getCleanupScrollListeners();
    },
    get currentSelection() {
      return args.getCurrentSelection();
    },
    get currentState() {
      return args.getCurrentState();
    },
    get dom() {
      return args.getDom();
    },
    get dragStartPoint() {
      return args.getDragStartPoint();
    },
    get mouseDownPoint() {
      return args.getMouseDownPoint();
    },
    get selectionAtDragStart() {
      return args.getSelectionAtDragStart();
    },
  };
}

function createSelectionModeMutableRefInteractionGetters(args: MutableRefGetterArgs) {
  return {
    get hasMovedEnough() {
      return args.getHasMovedEnough();
    },
    get hoveredElement() {
      return args.getHoveredElement();
    },
    get isActive() {
      return args.getIsActive();
    },
    get isDragging() {
      return args.getIsDragging();
    },
    get isResizing() {
      return args.getIsResizing();
    },
    get maintainAspectRatio() {
      return args.getMaintainAspectRatio();
    },
  };
}

export function createSelectionModeMutableRefGetters(
  args: MutableRefGetterArgs
): SelectionModeMutableRefs {
  return mergeSelectionModeMutableRefGetters(
    createSelectionModeMutableRefCoreGetters(args),
    createSelectionModeMutableRefInteractionGetters(args),
    {
      get dragThreshold() {
        return args.getDragThreshold();
      },
      get resizeDirection() {
        return args.getResizeDirection();
      },
      get skipNextClick() {
        return args.getSkipNextClick();
      },
    }
  );
}
