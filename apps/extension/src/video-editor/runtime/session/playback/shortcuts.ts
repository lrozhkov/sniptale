import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { isEditableTarget } from '../../app-model/utils';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { applyPlaybackSelectionNudge, resolvePlaybackSelectionNudge } from './nudge';
import type { PlaybackHandlers, PlaybackLatestState } from '../../../interaction/playback/types';

const KEYDOWN_LISTENER_OPTIONS = { capture: true };
const handledKeyDownEvents = new WeakSet<KeyboardEvent>();

function handleSelectionDelete(
  latestState: PlaybackLatestState,
  handlersRef: MutableRefObject<PlaybackHandlers>
): void {
  switch (latestState.selection.kind) {
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.TRACK:
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return;
    case VideoEditorSelectionKind.CLIP:
      if (latestState.selectedClipId) {
        handlersRef.current.deleteClip(latestState.selectedClipId);
      }
      return;
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      handlersRef.current.deleteActionEvent(latestState.selection.actionEventId);
      return;
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      handlersRef.current.deleteCursorSample(latestState.selection.sampleId);
      return;
    case VideoEditorSelectionKind.OBJECT_TRACK:
      handlersRef.current.deleteObjectTrack(latestState.selection.objectTrackId);
      return;
    case VideoEditorSelectionKind.MOTION_REGION:
      handlersRef.current.deleteMotionRegion(latestState.selection.motionRegionId);
      return;
  }
}

function handlePlaybackShortcutKeyDown(
  event: KeyboardEvent,
  latestStateRef: MutableRefObject<PlaybackLatestState>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  togglePlayback: () => void
): void {
  const latestState = latestStateRef.current;
  if (!latestState.project || isEditableTarget(event.target)) {
    return;
  }

  if (event.code === 'Escape' && latestState.placementMode !== null) {
    event.preventDefault();
    handlersRef.current.clearPlacementMode();
    return;
  }

  if (handlePlaybackToggleShortcut(event, togglePlayback)) {
    return;
  }

  if (event.code === 'KeyS' && latestState.selectedClipId) {
    event.preventDefault();
    handlersRef.current.splitClipAt(latestState.selectedClipId, latestState.currentTime);
    return;
  }

  if (handlePlaybackNudgeShortcut(event, latestState, handlersRef)) {
    return;
  }

  if (event.code !== 'Delete' && event.code !== 'Backspace') {
    return;
  }

  event.preventDefault();
  handleSelectionDelete(latestState, handlersRef);
}

function handlePlaybackToggleShortcut(event: KeyboardEvent, togglePlayback: () => void): boolean {
  if (event.code === 'Space') {
    event.preventDefault();
    event.stopPropagation();
    togglePlayback();
    return true;
  }

  if (event.code === 'KeyK') {
    event.preventDefault();
    togglePlayback();
    return true;
  }

  return false;
}

function handlePlaybackNudgeShortcut(
  event: KeyboardEvent,
  latestState: PlaybackLatestState,
  handlersRef: MutableRefObject<PlaybackHandlers>
): boolean {
  const nudge = resolvePlaybackSelectionNudge(event.code, event.shiftKey, {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  });
  if (nudge) {
    if (applyPlaybackSelectionNudge(latestState, handlersRef.current, nudge)) {
      event.preventDefault();
    }
    return true;
  }

  return false;
}

export function usePlaybackShortcuts(
  latestStateRef: MutableRefObject<PlaybackLatestState>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  togglePlayback: () => void
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (handledKeyDownEvents.has(event)) {
        return;
      }

      handledKeyDownEvents.add(event);
      handlePlaybackShortcutKeyDown(event, latestStateRef, handlersRef, togglePlayback);
    };

    window.addEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    document.addEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
      document.removeEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    };
  }, [handlersRef, latestStateRef, togglePlayback]);
}
