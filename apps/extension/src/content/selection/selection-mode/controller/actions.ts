import { logSelectionModeDiag } from '../diag';
import {
  deactivateOtherContentModes,
  setContentModeEnabled,
} from '../../../application/mode-session';
import type { SelectionModeRuntime } from '../runtime/composition';
import type { SelectionModeActivationOptions } from '../types';

const deactivateOtherContentModesTyped: (mode: 'selection-mode') => void =
  deactivateOtherContentModes;

const setContentModeEnabledTyped: (mode: 'selection-mode', enabled: boolean) => void =
  setContentModeEnabled;

export function createSelectionModeControllerActions(props: {
  cleanup: () => void;
  runtime: Pick<
    SelectionModeRuntime,
    'disableSelectionMode' | 'enableSelectionMode' | 'isSelectionModeActive'
  >;
}) {
  return {
    disableSelectionMode: () => {
      logSelectionModeDiag('disableSelectionMode.requested');
      props.runtime.disableSelectionMode();
    },
    enableSelectionMode: (options?: SelectionModeActivationOptions) => {
      logSelectionModeDiag('enableSelectionMode.requested');
      deactivateOtherContentModesTyped('selection-mode');
      const pendingSelection = props.runtime.enableSelectionMode(options);
      setContentModeEnabledTyped('selection-mode', true);
      return pendingSelection;
    },
    isSelectionModeActive: () => props.runtime.isSelectionModeActive(),
    cleanup: props.cleanup,
  };
}
