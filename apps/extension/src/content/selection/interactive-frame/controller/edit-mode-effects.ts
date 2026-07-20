import React from 'react';
import { queryContentUiElement } from '../../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import { clearFrameEditing, setFrameEditing } from '../../highlighter';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';

const logger = createLogger({ namespace: 'ContentInteractiveFrameEditing' });

function isEditableElement(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}

function isEditableKeyboardTarget(event: KeyboardEvent): boolean {
  if (isEditableElement(event.target)) {
    return true;
  }

  return event.composedPath().some(isEditableElement);
}

export function useInteractiveFrameIdleReset(params: {
  state: FrameState;
  frameWithoutLinkedElement: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    state,
    frameWithoutLinkedElement,
    setTempFrame,
    setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen,
  } = params;

  React.useEffect(() => {
    if (state === 'idle') {
      setIsStepBadgePopoverOpen(false);
      setIsCalloutPopoverOpen(false);
      setTempFrame(frameWithoutLinkedElement);
    }
  }, [
    state,
    setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen,
    setTempFrame,
    frameWithoutLinkedElement,
  ]);
}

export function useInteractiveFrameEditingOverlayEffect(
  state: FrameState,
  isCalloutEditing: boolean
) {
  React.useEffect(() => {
    const isFrameInteractionEditing = state === 'editing' || isCalloutEditing;
    if (!isFrameInteractionEditing) {
      return;
    }

    setFrameEditing();
    const overlayContainer = queryContentUiElement<HTMLElement>('.sniptale-highlight-container');
    if (overlayContainer instanceof HTMLElement) {
      overlayContainer.classList.add('sniptale-hidden-during-edit');
    }

    return () => {
      clearFrameEditing();
      if (overlayContainer instanceof HTMLElement) {
        overlayContainer.classList.remove('sniptale-hidden-during-edit');
      }
    };
  }, [isCalloutEditing, state]);
}

export function useInteractiveFrameEditingKeyboardEffect(params: {
  state: FrameState;
  handleCancelRef: React.MutableRefObject<() => void>;
  handleSaveRef: React.MutableRefObject<() => void>;
  handleDeleteRef: React.MutableRefObject<() => void>;
}) {
  const { state, handleCancelRef, handleSaveRef, handleDeleteRef } = params;

  React.useEffect(() => {
    if (state !== 'editing') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event)) {
        if (event.key === 'Enter' || event.key === 'Escape') {
          logger.debug('Ignoring frame hotkey from editable target', {
            key: event.key,
          });
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancelRef.current();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleSaveRef.current();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleDeleteRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, handleCancelRef, handleSaveRef, handleDeleteRef]);
}
