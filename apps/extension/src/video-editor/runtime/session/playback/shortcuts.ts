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
    case VideoEditorSelectionKind.MOTION_LANE:
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
  seekTo: (time: number) => void,
  stepByFrames: (frameDelta: number) => void,
  togglePlayback: () => void
): void {
  const latestState = latestStateRef.current;
  if (!latestState.project || isEditableTarget(event.target) || isControlNavigation(event)) {
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

  if (handlePlaybackBoundaryShortcut(event, latestState.project.duration, seekTo)) {
    return;
  }

  if (handlePlaybackFrameStepShortcut(event, stepByFrames)) {
    return;
  }

  if (latestState.projectHistoryTransactionActive) {
    return;
  }

  if (handleSelectedClipShortcut(event, latestState, handlersRef)) {
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

function isControlNavigation(event: KeyboardEvent): boolean {
  const navigationKey =
    event.code.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(event.code);
  if (!navigationKey || !(event.target instanceof Element)) return false;
  return (
    event.target.closest(
      [
        'input',
        'select',
        'nav button',
        'button[aria-haspopup]',
        '[role="option"]',
        '[role="listbox"]',
        '[role="checkbox"]',
        '[role="switch"]',
        '[role="radio"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="separator"]',
      ].join(',')
    ) !== null
  );
}

function handleSelectedClipShortcut(
  event: KeyboardEvent,
  latestState: PlaybackLatestState,
  handlersRef: MutableRefObject<PlaybackHandlers>
): boolean {
  if (!latestState.selectedClipId) return false;

  if (
    event.code === 'KeyD' &&
    event.ctrlKey !== event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    handlersRef.current.duplicateClip(latestState.selectedClipId);
    return true;
  }

  if (
    event.code === 'KeyS' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    handlersRef.current.splitClipAt(latestState.selectedClipId, latestState.currentTime);
    return true;
  }

  return false;
}

function handlePlaybackFrameStepShortcut(
  event: KeyboardEvent,
  stepByFrames: (frameDelta: number) => void
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code !== 'Comma' && event.code !== 'Period') return false;
  event.preventDefault();
  stepByFrames(event.code === 'Comma' ? -1 : 1);
  return true;
}

function handlePlaybackBoundaryShortcut(
  event: KeyboardEvent,
  projectDuration: number,
  seekTo: (time: number) => void
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  if (event.code !== 'Home' && event.code !== 'End') {
    return false;
  }

  event.preventDefault();
  seekTo(event.code === 'Home' ? 0 : projectDuration);
  return true;
}

function handlePlaybackToggleShortcut(event: KeyboardEvent, togglePlayback: () => void): boolean {
  if (
    event.code === 'KeyK' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
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
  if (
    event.target instanceof Element &&
    event.target.closest('[role="slider"]') !== null &&
    event.code.startsWith('Arrow')
  ) {
    return false;
  }
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

/** Registers Space for one active transport; the context owner releases it on deactivation. */
export function registerPlaybackSpaceShortcut(togglePlayback: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) togglePlayback();
  };
  window.addEventListener('keydown', onKeyDown, KEYDOWN_LISTENER_OPTIONS);
  return () => window.removeEventListener('keydown', onKeyDown, KEYDOWN_LISTENER_OPTIONS);
}

export function usePlaybackShortcuts(
  latestStateRef: MutableRefObject<PlaybackLatestState>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  seekTo: (time: number) => void,
  stepByFrames: (frameDelta: number) => void,
  togglePlayback: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (handledKeyDownEvents.has(event)) {
        return;
      }

      handledKeyDownEvents.add(event);
      handlePlaybackShortcutKeyDown(
        event,
        latestStateRef,
        handlersRef,
        seekTo,
        stepByFrames,
        togglePlayback
      );
    };

    const releaseSpace = registerPlaybackSpaceShortcut(() => {
      if (latestStateRef.current.project) togglePlayback();
    });
    window.addEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    document.addEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    return () => {
      releaseSpace();
      window.removeEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
      document.removeEventListener('keydown', handleKeyDown, KEYDOWN_LISTENER_OPTIONS);
    };
  }, [enabled, handlersRef, latestStateRef, seekTo, stepByFrames, togglePlayback]);
}
