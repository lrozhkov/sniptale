// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { usePlaybackShortcuts } from './playback/shortcuts';
import type { PlaybackHandlers, PlaybackLatestState } from '../../interaction/playback/types';

function ShortcutHarness(props: {
  latestState: PlaybackLatestState;
  handlers: PlaybackHandlers;
  togglePlayback: () => void;
}) {
  const latestStateRef = { current: props.latestState };
  const handlersRef = { current: props.handlers };
  usePlaybackShortcuts(latestStateRef, handlersRef, props.togglePlayback);
  return null;
}

function createLatestState(): PlaybackLatestState {
  return {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project: createEmptyVideoProject('Playback shortcut ownership'),
    selectedActionEvent: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selection: { kind: VideoEditorSelectionKind.SCENE },
  };
}

function createHandlers(): PlaybackHandlers {
  return {
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn(),
    deleteClip: vi.fn(),
    deleteCursorSample: vi.fn(),
    deleteMotionRegion: vi.fn(),
    deleteObjectTrack: vi.fn(),
    setCurrentTime: vi.fn(),
    setPlaying: vi.fn(),
    splitClipAt: vi.fn(),
    updateActionEventDetails: vi.fn(),
    updateClipTransform: vi.fn(),
    updateMotionRegion: vi.fn(),
  };
}

function dispatchSpaceKeyDown(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'Space',
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchDeleteKeyDown(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'Delete',
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchSpaceKeyDownInAct(target: EventTarget): KeyboardEvent {
  let event: KeyboardEvent | null = null;
  act(() => {
    event = dispatchSpaceKeyDown(target);
  });
  if (!event) {
    throw new Error('Expected dispatched keyboard event');
  }

  return event;
}

function renderShortcutHarness(root: Root, togglePlayback: () => void) {
  act(() => {
    root.render(
      <ShortcutHarness
        handlers={createHandlers()}
        latestState={createLatestState()}
        togglePlayback={togglePlayback}
      />
    );
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('owns Space on focused non-text controls before target handlers run', async () => {
  const togglePlayback = vi.fn();
  renderShortcutHarness(root!, togglePlayback);
  const buttonKeyDown = vi.fn();
  const optionKeyDown = vi.fn();
  const triggerKeyDown = vi.fn();
  const button = document.createElement('button');
  const option = document.createElement('div');
  const selectTrigger = document.createElement('button');
  button.addEventListener('keydown', buttonKeyDown);
  option.addEventListener('keydown', optionKeyDown);
  option.setAttribute('role', 'option');
  selectTrigger.addEventListener('keydown', triggerKeyDown);
  selectTrigger.setAttribute('aria-haspopup', 'listbox');
  document.body.append(button, option, selectTrigger);
  await act(async () => undefined);

  const buttonEvent = dispatchSpaceKeyDownInAct(button);
  const optionEvent = dispatchSpaceKeyDownInAct(option);
  const triggerEvent = dispatchSpaceKeyDownInAct(selectTrigger);

  expect(buttonEvent.defaultPrevented).toBe(true);
  expect(optionEvent.defaultPrevented).toBe(true);
  expect(triggerEvent.defaultPrevented).toBe(true);
  expect(togglePlayback).toHaveBeenCalledTimes(3);
  expect(buttonKeyDown).not.toHaveBeenCalled();
  expect(optionKeyDown).not.toHaveBeenCalled();
  expect(triggerKeyDown).not.toHaveBeenCalled();
  button.remove();
  option.remove();
  selectTrigger.remove();
});

it('deletes selected object tracks through playback shortcuts', async () => {
  const handlers = createHandlers();
  act(() => {
    root?.render(
      <ShortcutHarness
        handlers={handlers}
        latestState={{
          ...createLatestState(),
          selection: {
            kind: VideoEditorSelectionKind.OBJECT_TRACK,
            objectTrackId: 'visual-cursor',
          },
        }}
        togglePlayback={vi.fn()}
      />
    );
  });
  await act(async () => undefined);

  act(() => {
    dispatchDeleteKeyDown(document.body);
  });

  expect(handlers.deleteObjectTrack).toHaveBeenCalledWith('visual-cursor');
});

it('leaves Space ownership with text-entry targets', async () => {
  const togglePlayback = vi.fn();
  renderShortcutHarness(root!, togglePlayback);
  const input = document.createElement('input');
  const textArea = document.createElement('textarea');
  const editable = document.createElement('div');
  const nestedEditable = document.createElement('span');
  editable.setAttribute('contenteditable', 'true');
  editable.appendChild(nestedEditable);
  document.body.append(input, textArea, editable);
  await act(async () => undefined);

  const inputEvent = dispatchSpaceKeyDownInAct(input);
  const textAreaEvent = dispatchSpaceKeyDownInAct(textArea);
  const editableEvent = dispatchSpaceKeyDownInAct(nestedEditable);

  expect(inputEvent.defaultPrevented).toBe(false);
  expect(textAreaEvent.defaultPrevented).toBe(false);
  expect(editableEvent.defaultPrevented).toBe(false);
  expect(togglePlayback).not.toHaveBeenCalled();
  input.remove();
  textArea.remove();
  editable.remove();
});
