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
  seekTo: (time: number) => void;
  stepByFrames: (frameDelta: number) => void;
  togglePlayback: () => void;
}) {
  const latestStateRef = { current: props.latestState };
  const handlersRef = { current: props.handlers };
  usePlaybackShortcuts(
    latestStateRef,
    handlersRef,
    props.seekTo,
    props.stepByFrames,
    props.togglePlayback
  );
  return null;
}

function createLatestState(): PlaybackLatestState {
  return {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project: createEmptyVideoProject('Playback shortcut ownership'),
    projectHistoryTransactionActive: false,
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

function renderShortcutHarness(root: Root, togglePlayback: () => void, seekTo = vi.fn()) {
  act(() => {
    root.render(
      <ShortcutHarness
        handlers={createHandlers()}
        latestState={createLatestState()}
        seekTo={seekTo}
        stepByFrames={vi.fn()}
        togglePlayback={togglePlayback}
      />
    );
  });
}

it('owns plain Home and End while leaving modified and text-entry navigation native', () => {
  const seekTo = vi.fn();
  const latestState = createLatestState();
  latestState.project!.duration = 12;
  act(() => {
    root!.render(
      <ShortcutHarness
        handlers={createHandlers()}
        latestState={latestState}
        seekTo={seekTo}
        stepByFrames={vi.fn()}
        togglePlayback={vi.fn()}
      />
    );
  });
  const input = document.createElement('input');
  document.body.append(input);

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Home' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'End' }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Home', shiftKey: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'End', ctrlKey: true })
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Home' }));
  });

  expect(seekTo.mock.calls).toEqual([[0], [12]]);
  input.remove();
});

it('owns plain Comma and Period for symmetric frame stepping', () => {
  const stepByFrames = vi.fn();
  const input = document.createElement('input');
  document.body.append(input);
  act(() => {
    root!.render(
      <ShortcutHarness
        handlers={createHandlers()}
        latestState={createLatestState()}
        seekTo={vi.fn()}
        stepByFrames={stepByFrames}
        togglePlayback={vi.fn()}
      />
    );
  });

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Comma' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Period' }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Comma', shiftKey: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Period', ctrlKey: true })
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Comma' }));
  });

  expect(stepByFrames.mock.calls).toEqual([[-1], [1]]);
  input.remove();
});

it('leaves focused playhead slider arrows with the local frame-step owner', () => {
  const handlers = createHandlers();
  const latestState = createLatestState();
  latestState.project!.clips = [
    {
      id: 'clip-1',
      trackId: latestState.project!.tracks[0]!.id,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    },
  ] as never;
  latestState.selectedClipId = 'clip-1';
  latestState.selection = { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' };
  const localStep = vi.fn();
  const slider = document.createElement('div');
  slider.dataset['ui'] = 'video-editor.timeline.playhead-handle';
  slider.setAttribute('role', 'slider');
  slider.addEventListener('keydown', (event) => {
    if (!event.defaultPrevented && event.key === 'ArrowRight') localStep();
  });
  document.body.append(slider);
  act(() => {
    root!.render(
      <ShortcutHarness
        handlers={handlers}
        latestState={latestState}
        seekTo={vi.fn()}
        stepByFrames={vi.fn()}
        togglePlayback={vi.fn()}
      />
    );
  });

  act(() => {
    slider.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'ArrowRight',
        key: 'ArrowRight',
      })
    );
  });

  expect(localStep).toHaveBeenCalledOnce();
  expect(handlers.updateClipTransform).not.toHaveBeenCalled();
  slider.remove();
});

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
        seekTo={vi.fn()}
        stepByFrames={vi.fn()}
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

it('leaves mutation shortcuts inert during a project-history transaction', async () => {
  const handlers = createHandlers();
  act(() => {
    root?.render(
      <ShortcutHarness
        handlers={handlers}
        latestState={{
          ...createLatestState(),
          projectHistoryTransactionActive: true,
          selectedClipId: 'clip-1',
          selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' },
        }}
        seekTo={vi.fn()}
        stepByFrames={vi.fn()}
        togglePlayback={vi.fn()}
      />
    );
  });
  await act(async () => undefined);

  const event = dispatchDeleteKeyDown(document.body);

  expect(event.defaultPrevented).toBe(false);
  expect(handlers.deleteClip).not.toHaveBeenCalled();
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
