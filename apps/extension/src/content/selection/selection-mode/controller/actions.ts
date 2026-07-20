import { logSelectionModeDiag } from '../diag';
import {
  deactivateOtherContentModes,
  setContentModeEnabled,
} from '../../../application/mode-session';
import type { SelectionModeRuntimeFacade } from './runtime-bindings';

const deactivateOtherContentModesTyped: (mode: 'selection-mode') => void =
  deactivateOtherContentModes;

const setContentModeEnabledTyped: (mode: 'selection-mode', enabled: boolean) => void =
  setContentModeEnabled;

export function createSelectionModeControllerActions(props: {
  cleanup: () => void;
  runtimeFacade: SelectionModeRuntimeFacade;
}) {
  return {
    disableSelectionMode: () => {
      logSelectionModeDiag('disableSelectionMode.requested');
      props.runtimeFacade.disableSelectionMode();
    },
    enableSelectionMode: () => {
      logSelectionModeDiag('enableSelectionMode.requested');
      deactivateOtherContentModesTyped('selection-mode');
      const pendingSelection = props.runtimeFacade.enableSelectionMode();
      setContentModeEnabledTyped('selection-mode', true);
      return pendingSelection;
    },
    isSelectionModeActive: () => props.runtimeFacade.isSelectionModeActive(),
    cleanup: props.cleanup,
  };
}
