// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { PlaybackHandlers, PlaybackLatestState } from '../../interaction/playback/types';
import { usePlaybackShortcuts } from './playback/shortcuts';

it('deletes the selected effect instance through the playback shortcut', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const deleteEffectInstance = vi.fn();
  const handlers = {
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn(),
    deleteClip: vi.fn(),
    deleteCursorSample: vi.fn(),
    deleteEffectInstance,
    deleteMotionRegion: vi.fn(),
    deleteObjectTrack: vi.fn(),
    duplicateClip: vi.fn(),
    setCurrentTime: vi.fn(),
    setPlaying: vi.fn(),
    splitClipAt: vi.fn(),
    updateActionEventDetails: vi.fn(),
    updateClipTransform: vi.fn(),
    updateMotionRegion: vi.fn(),
  } satisfies PlaybackHandlers;
  const state = {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project: createEmptyVideoProject('Effect shortcut'),
    projectHistoryTransactionActive: false,
    selectedActionOccurrence: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selection: {
      kind: VideoEditorSelectionKind.EFFECT_INSTANCE,
      effectInstanceId: 'effect-instance',
    },
  } satisfies PlaybackLatestState;

  function Harness() {
    usePlaybackShortcuts({ current: state }, { current: handlers }, vi.fn(), vi.fn(), vi.fn());
    return null;
  }

  try {
    act(() => root.render(<Harness />));
    await act(async () => undefined);
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Delete' })
      );
    });
    expect(deleteEffectInstance).toHaveBeenCalledWith('effect-instance');
  } finally {
    act(() => root.unmount());
  }
});
