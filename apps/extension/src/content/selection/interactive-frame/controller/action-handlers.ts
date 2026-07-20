import React from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import { pauseHighlighter } from '../../highlighter';
import {
  cancelInteractiveFrameEditing,
  deleteInteractiveFrame,
  saveInteractiveFrame,
  toggleInteractiveFrameEffectMode,
} from '../editing/actions';
import type { InteractiveFrameActionParams } from './types';

function useInteractiveFrameUpdateRef(onUpdate: (frame: FrameData) => void) {
  const onUpdateRef = React.useRef(onUpdate);

  React.useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  return onUpdateRef;
}

function useInteractiveFrameEditHandlers(
  params: InteractiveFrameActionParams,
  onUpdateRef: React.MutableRefObject<(frame: FrameData) => void>
) {
  const handleStartEditing = useInteractiveFrameStartEditing(params);
  const persistHandlers = useInteractiveFramePersistHandlers(params, onUpdateRef);

  return {
    handleStartEditing,
    ...persistHandlers,
  };
}

function useInteractiveFrameStartEditing(params: InteractiveFrameActionParams) {
  const {
    frameWithoutLinkedElement,
    effectMode,
    setState,
    setTempFrame,
    closePopover,
    startFrameRef,
    startEffectModeRef,
  } = params;
  return React.useCallback(() => {
    pauseHighlighter();
    closePopover();
    startFrameRef.current = { ...frameWithoutLinkedElement };
    startEffectModeRef.current = effectMode;
    setState('editing');
    setTempFrame({ ...frameWithoutLinkedElement });
  }, [
    closePopover,
    effectMode,
    frameWithoutLinkedElement,
    setState,
    setTempFrame,
    startEffectModeRef,
    startFrameRef,
  ]);
}

function useInteractiveFramePersistHandlers(
  params: InteractiveFrameActionParams,
  onUpdateRef: React.MutableRefObject<(frame: FrameData) => void>
) {
  const handleSave = useInteractiveFrameSaveHandler(params, onUpdateRef);
  const handleCancel = useInteractiveFrameCancelHandler(params);
  const handleDelete = useInteractiveFrameDeleteHandler(params);

  return {
    handleSave,
    handleCancel,
    handleDelete,
  };
}

function useInteractiveFrameSaveHandler(
  params: InteractiveFrameActionParams,
  onUpdateRef: React.MutableRefObject<(frame: FrameData) => void>
) {
  const { frame, tempFrame, effectMode, setState } = params;

  return React.useCallback(() => {
    saveInteractiveFrame({
      tempFrame,
      effectMode,
      frame,
      onUpdate: onUpdateRef.current,
      setState,
    });
  }, [effectMode, frame, onUpdateRef, setState, tempFrame]);
}

function useInteractiveFrameCancelHandler(params: InteractiveFrameActionParams) {
  const {
    setTempFrame,
    setEffectMode,
    onUpdate,
    onCancel,
    setState,
    startFrameRef,
    startEffectModeRef,
  } = params;

  return React.useCallback(() => {
    const cancelArgs = {
      startFrameRef,
      startEffectModeRef,
      setTempFrame,
      setEffectMode,
      onUpdate,
      setState,
      ...(onCancel === undefined ? {} : { onCancel }),
    };

    cancelInteractiveFrameEditing(cancelArgs);
  }, [
    onCancel,
    onUpdate,
    setEffectMode,
    setState,
    setTempFrame,
    startEffectModeRef,
    startFrameRef,
  ]);
}

function useInteractiveFrameDeleteHandler(params: InteractiveFrameActionParams) {
  const { onDelete, setState } = params;

  return React.useCallback(() => {
    deleteInteractiveFrame({ onDelete, setState });
  }, [onDelete, setState]);
}

function useInteractiveFrameEffectHandler(params: InteractiveFrameActionParams) {
  const { closePopover, effectMode, frame, onEffectChange, openPopover, setEffectMode } = params;

  return React.useCallback(
    (mode: EffectMode) => {
      const effectArgs = {
        mode,
        frameId: frame.id,
        effectMode,
        closePopover,
        openPopover,
        setEffectMode,
        ...(onEffectChange === undefined ? {} : { onEffectChange }),
      };

      toggleInteractiveFrameEffectMode(effectArgs);
    },
    [closePopover, effectMode, frame.id, onEffectChange, openPopover, setEffectMode]
  );
}

/** Builds stable action handlers for interactive-frame editing and effect-mode transitions. */
export function useInteractiveFrameActionHandlers(params: InteractiveFrameActionParams) {
  const onUpdateRef = useInteractiveFrameUpdateRef(params.onUpdate);
  const editHandlers = useInteractiveFrameEditHandlers(params, onUpdateRef);
  const handleEffectButtonClick = useInteractiveFrameEffectHandler(params);

  return {
    ...editHandlers,
    handleEffectButtonClick,
  };
}
