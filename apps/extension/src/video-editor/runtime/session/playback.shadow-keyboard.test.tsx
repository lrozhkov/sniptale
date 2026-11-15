// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { PlaybackHandlers, PlaybackLatestState } from '../../interaction/playback/types';
import { usePlaybackShortcuts } from './playback/shortcuts';

it('keeps shadow text input outside playback and selection commands', () => {
  const container = document.createElement('div');
  const overlay = document.createElement('div');
  const shadow = overlay.attachShadow({ mode: 'open' });
  document.body.append(container, overlay);
  const root = createRoot(container);
  const command = vi.fn();
  const handlers: PlaybackHandlers = {
    clearPlacementMode: command,
    deleteActionEvent: command,
    deleteClip: command,
    deleteCursorSample: command,
    editCommentDocument: command,
    deleteSourceVoiceover: command,
    duplicateSourceVoiceover: () => null,
    deleteEffectInstance: command,
    deleteMotionRegion: command,
    deleteObjectTrack: command,
    duplicateClip: command,
    setCurrentTime: command,
    setPlaying: command,
    splitClipAt: command,
    updateActionEventDetails: command,
    updateClipTransform: command,
    updateMotionRegion: command,
  };
  const state: PlaybackLatestState = {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project: createEmptyVideoProject('Shadow keyboard'),
    projectHistoryTransactionActive: false,
    selectedActionOccurrence: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selection: { kind: 'scene' },
  };
  function Harness() {
    usePlaybackShortcuts({ current: state }, { current: handlers }, command, command, command);
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    for (const tag of ['textarea', 'input', 'div']) {
      const field = document.createElement(tag);
      if (tag === 'div') field.setAttribute('contenteditable', 'true');
      shadow.append(field);
      for (const code of ['Space', 'ArrowRight', 'Delete', 'Backspace']) {
        const event = new KeyboardEvent('keydown', {
          key: code === 'Space' ? ' ' : code,
          code,
          bubbles: true,
          composed: true,
          cancelable: true,
        });
        act(() => field.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
      }
    }
    expect(command).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    overlay.remove();
  }
});
