import { getMaxSelectionHeight, getMaxSelectionWidth } from '../../constants';
import { createSelectionModeRuntimeFacade } from '../../runtime/facade';
import type { SelectionModeRuntimeFacade } from '../../runtime/facade/types';
import { setupSelectionModeRuntimeListeners } from '../../interaction/actions/runtime';
import type { SelectionModeSession } from '../../session';

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
}): SelectionModeRuntimeFacade {
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
    setAspectRatio: (value) => {
      props.session.aspectRatio = value;
    },
    setCurrentSelection: (value) => {
      props.session.currentSelection = value;
    },
    setCurrentState: (value) => {
      props.session.currentState = value;
    },
    setIsActive: (value) => {
      props.session.isActive = value;
    },
    setMaintainAspectRatio: (value) => {
      props.session.maintainAspectRatio = value;
    },
    setRejectCallback: (value) => {
      props.session.rejectCallback = value;
    },
    setResolveCallback: (value) => {
      props.session.resolveCallback = value;
    },
    setupRuntimeListeners: () => setupSelectionModeRuntimeListeners(props.getRuntimeArgs()),
    state: props.session,
    updateFinalFrame: () => props.getRuntimeEvents().updateFinalFrame(),
  });
}
