import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import {
  createAreaSelectionState,
  createStartAreaSelection,
  createStopAreaSelection,
  type AreaSelectionRuntimeDeps,
} from './controller';
import { areaSelectionResultOwner, type AreaSelectionResultOwner } from './result';
import { areaSelectionSurface, type AreaSelectionSurface } from './surface';

interface AreaSelectionControllerDeps {
  clearScheduledTimeout?: (timeoutId: ReturnType<typeof setTimeout>) => void;
  result?: AreaSelectionResultOwner;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  surface?: AreaSelectionSurface;
  targetDocument?: Document;
}

interface AreaSelectionController {
  startAreaSelection: () => Promise<SelectedArea>;
  stopAreaSelection: () => void;
  dispose: () => void;
}

/**
 * Creates an area-selection controller that owns DOM nodes, listeners, and timeout lifecycle.
 */
export function createAreaSelectionController(
  deps: AreaSelectionControllerDeps = {}
): AreaSelectionController {
  const runtimeDeps: AreaSelectionRuntimeDeps = {
    clearScheduledTimeout: deps.clearScheduledTimeout ?? globalThis.clearTimeout.bind(globalThis),
    result: deps.result ?? areaSelectionResultOwner,
    scheduleTimeout: deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis),
    surface: deps.surface ?? areaSelectionSurface,
    targetDocument: deps.targetDocument ?? document,
  };
  const state = createAreaSelectionState();
  const stopAreaSelection = createStopAreaSelection(state, runtimeDeps);

  return {
    startAreaSelection: createStartAreaSelection(state, runtimeDeps),
    stopAreaSelection,
    dispose: stopAreaSelection,
  };
}
