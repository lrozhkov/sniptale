// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { usePlaybackShortcuts } from '../../../runtime/session/playback/shortcuts';
import type { PlaybackLatestState, PlaybackHandlers } from '../../../interaction/playback/types';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { ProjectCursorFocusKeys } from './cursor-focus-keys';
import { useVideoEditorStore } from '../../../state/store';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  getCurrentLocale: () => 'en',
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  initial = useVideoEditorStore.getState();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(['key', 'row'] as const)(
  'gives cursor %s arrows one navigation owner while ordinary timeline arrows still step',
  (targetKind) => {
    const base = createVideoProjectFromRecording({
      recordingId: 'arrows',
      filename: 'arrows.webm',
      width: 100,
      height: 100,
      duration: 4,
      mimeType: 'video/webm',
      size: 4,
    });
    const project = applyVideoProjectMutationPatch(base, {
      cursorFocusPath: {
        version: 1,
        mode: 'fixed',
        gapPolicy: 'hold',
        smoothing: 0.5,
        sensitivity: 0.5,
        segments: [
          {
            id: 'manual',
            binding: { kind: 'project' },
            start: 0,
            end: 2,
            keys: [
              { id: 'first', time: 0, x: 0.2, y: 0.2, anchor: 'manual', interpolation: 'smooth' },
              { id: 'last', time: 2, x: 0.8, y: 0.8, anchor: 'manual', interpolation: 'smooth' },
            ],
          },
        ],
      },
    });
    const step = vi.fn();
    useVideoEditorStore.getState().setProject(project);
    useVideoEditorStore.getState().selectCursorSegment('first');
    function Harness() {
      const latest = useRef<PlaybackLatestState>({
        project,
        currentTime: 0,
        isPlaying: false,
        placementMode: null,
        playbackRange: null,
        projectHistoryTransactionActive: false,
        selection: { kind: 'cursor-segment', sampleId: 'first' },
        selectedClipId: null,
        selectedActionOccurrence: null,
        selectedMotionRegion: null,
      });
      const handlers = useRef<PlaybackHandlers>({
        clearPlacementMode: vi.fn(),
        deleteActionEvent: vi.fn(),
        deleteClip: vi.fn(),
        deleteCursorSample: vi.fn(),
        editCommentDocument: vi.fn(),
        deleteEffectInstance: vi.fn(),
        deleteMotionRegion: vi.fn(),
        deleteObjectTrack: vi.fn(),
        duplicateClip: vi.fn(),
        setCurrentTime: vi.fn(),
        setPlaying: vi.fn(),
        splitClipAt: vi.fn(),
        updateActionEventDetails: vi.fn(),
        updateClipTransform: vi.fn(),
        updateMotionRegion: vi.fn(),
      });
      usePlaybackShortcuts(latest, handlers, vi.fn(), step, vi.fn());
      return (
        <div data-ui="video-editor.timeline.canvas-scroll">
          <ProjectCursorFocusKeys project={project} pixelsPerSecond={100} />
          <button data-ordinary-timeline="true">Timeline</button>
        </div>
      );
    }
    act(() => root.render(<Harness />));
    const dispatch = (key: string) => {
      const target =
        targetKind === 'row'
          ? host.querySelector<HTMLButtonElement>(
              'button[title="videoEditor.sidebar.cursorFocusRowHint"]'
            )!
          : host.querySelector<HTMLButtonElement>('[data-cursor-focus-key="first"]')!;
      target.focus();
      act(() =>
        target.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: key, key })
        )
      );
    };
    dispatch('ArrowRight');
    expect(step).not.toHaveBeenCalled();
    expect(useVideoEditorStore.getState().currentTime).toBe(2);
    expect(useVideoEditorStore.getState().selection).toMatchObject({
      kind: 'cursor-segment',
      sampleId: 'last',
    });
    dispatch('ArrowRight');
    expect(step).not.toHaveBeenCalled();
    expect(useVideoEditorStore.getState().currentTime).toBe(2);
    dispatch('ArrowLeft');
    expect(useVideoEditorStore.getState().currentTime).toBe(0);
    const ordinary = host.querySelector<HTMLButtonElement>('[data-ordinary-timeline]')!;
    act(() =>
      ordinary.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, code: 'ArrowRight', key: 'ArrowRight' })
      )
    );
    expect(step).toHaveBeenCalledExactlyOnceWith(1);
  }
);
