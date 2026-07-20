import { getMaxSelectionHeight, getMaxSelectionWidth } from '../../constants';
import { createSelectionModeRuntimeFacade } from '../../runtime/facade';
import type {
  SelectionModeRuntimeFacade,
  SelectionModeRuntimeFacadeArgs,
} from '../../runtime/facade/types';
import { setupSelectionModeRuntimeListeners } from '../../interaction/actions/runtime';
import { createSelectionModeSessionLocalSetters } from '../../session/locals/setters';
import type { SelectionModeSession } from '../../session/locals/helpers';

type SelectionModeRuntimeArgs = Parameters<typeof setupSelectionModeRuntimeListeners>[0];

interface SelectionModeRuntimeEvents {
  cancelSelection: () => void;
  confirmSelection: () => void;
  constrainSelection: () => void;
  resetToIdleState: () => void;
  updateFinalFrame: () => void;
}

export function createSelectionModeFacadeBindings(props: {
  cleanup: () => void;
  getRuntimeArgs: () => SelectionModeRuntimeArgs;
  getRuntimeEvents: () => SelectionModeRuntimeEvents;
  session: SelectionModeSession;
  state: SelectionModeRuntimeFacadeArgs['state'];
}): SelectionModeRuntimeFacade {
  const sessionSetters = createSelectionModeSessionLocalSetters(props.session);

  return createSelectionModeRuntimeFacade({
    cancelSelection: () => props.getRuntimeEvents().cancelSelection(),
    cleanup: props.cleanup,
    confirmSelection: () => props.getRuntimeEvents().confirmSelection(),
    constrainSelection: () => props.getRuntimeEvents().constrainSelection(),
    getDom: () => props.session.dom,
    getAspectRatio: () => props.session.aspectRatio,
    getCurrentSelection: () => props.session.currentSelection,
    getIsActive: () => props.session.isActive,
    getMaintainAspectRatio: () => props.session.maintainAspectRatio,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    getRejectCallback: () => props.session.rejectCallback,
    resetToIdleState: () => props.getRuntimeEvents().resetToIdleState(),
    setAspectRatio: sessionSetters.setAspectRatio,
    setCurrentSelection: sessionSetters.setCurrentSelection,
    setCurrentState: sessionSetters.setCurrentState,
    setIsActive: sessionSetters.setIsActive,
    setMaintainAspectRatio: sessionSetters.setMaintainAspectRatio,
    setRejectCallback: sessionSetters.setRejectCallback,
    setResolveCallback: sessionSetters.setResolveCallback,
    setupRuntimeListeners: () => setupSelectionModeRuntimeListeners(props.getRuntimeArgs()),
    state: props.state,
    updateFinalFrame: () => props.getRuntimeEvents().updateFinalFrame(),
  });
}
