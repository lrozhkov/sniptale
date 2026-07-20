import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import {
  createAreaSelectionState,
  createStartAreaSelection,
  createStopAreaSelection,
  type AreaSelectionRuntimeDeps,
} from './controller';
import {
  completeAreaSelection,
  createSelectionElement,
  handleAreaSelectionTimeout,
  hideSelectionElement,
  removeAreaSelectionTooltip,
  showAreaSelectionTooltip,
  updateSelectionBox,
} from './helpers';

interface AreaSelectionControllerDeps {
  createSelectionElement?: () => HTMLDivElement;
  completeAreaSelection?: typeof completeAreaSelection;
  handleAreaSelectionTimeout?: typeof handleAreaSelectionTimeout;
  hideSelectionElement?: typeof hideSelectionElement;
  removeAreaSelectionTooltip?: typeof removeAreaSelectionTooltip;
  showAreaSelectionTooltip?: typeof showAreaSelectionTooltip;
  updateSelectionBox?: typeof updateSelectionBox;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearScheduledTimeout?: (timeoutId: ReturnType<typeof setTimeout>) => void;
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
    completeAreaSelection: deps.completeAreaSelection ?? completeAreaSelection,
    createSelectionElement: deps.createSelectionElement ?? createSelectionElement,
    handleAreaSelectionTimeout: deps.handleAreaSelectionTimeout ?? handleAreaSelectionTimeout,
    hideSelectionElement: deps.hideSelectionElement ?? hideSelectionElement,
    removeAreaSelectionTooltip: deps.removeAreaSelectionTooltip ?? removeAreaSelectionTooltip,
    scheduleTimeout: deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis),
    showAreaSelectionTooltip: deps.showAreaSelectionTooltip ?? showAreaSelectionTooltip,
    targetDocument: deps.targetDocument ?? document,
    updateSelectionBox: deps.updateSelectionBox ?? updateSelectionBox,
  };
  const state = createAreaSelectionState();
  const stopAreaSelection = createStopAreaSelection(state, runtimeDeps);

  return {
    startAreaSelection: createStartAreaSelection(state, runtimeDeps),
    stopAreaSelection,
    dispose: stopAreaSelection,
  };
}
