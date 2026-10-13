// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { ReviewZoomLane, ReviewAudioLane } from './timeline-lane-bindings';
import type { ReviewZoomTrack } from './zoom-track';
import type { ReviewAudioTrack } from './audio-track';

const observed = vi.hoisted(() => ({ zoom: vi.fn(), audio: vi.fn() }));
vi.mock('./zoom-track', () => ({
  ReviewZoomTrack: (props: ComponentProps<typeof ReviewZoomTrack>) => {
    observed.zoom(props);
    return (
      <>
        <button onClick={props.onToggleEnabled}>Toggle</button>
        <button onClick={() => props.onLink?.('first', 'next')}>Link</button>
        <button onClick={() => props.onSelectLink?.('first')}>Inspect link</button>
      </>
    );
  },
}));
vi.mock('./audio-track', () => ({
  ReviewAudioTrack: (props: ComponentProps<typeof ReviewAudioTrack>) => {
    observed.audio(props);
    return (
      <>
        <button onClick={() => props.onSelect('music')}>Select audio</button>
        <button onClick={() => props.onMoveClip('music', 'music', 1.5)}>Move audio</button>
        <button onClick={() => props.onTrimClip('music', 'music', 'end', 2)}>Trim audio</button>
      </>
    );
  },
}));

it.each([false, true])(
  'zoom result-time actions share admitted history commands, direct=%s',
  async (direct) => {
    const host = document.createElement('div'),
      root = createRoot(host);
    const commands = { toggleEnabled: vi.fn(), change: vi.fn(), setLinkSelection: vi.fn() };
    let allowed = false;
    const props = {
      compact: false,
      advanced: createQuickEditAdvancedState(),
      resultDuration: 2,
      outputTime: 1,
      edits: [],
      zoom: commands,
      toOutputTime: (source: number) => source / 2,
      ...(!direct
        ? {
            beforeAction: (action: () => void) => {
              if (allowed) action();
            },
          }
        : {}),
    } as unknown as ComponentProps<typeof ReviewZoomLane>;
    const click = async (label: string) =>
      act(async () =>
        [...host.querySelectorAll('button')].find((node) => node.textContent === label)!.click()
      );
    try {
      await act(async () => root.render(<ReviewZoomLane {...props} />));
      const lane = observed.zoom.mock.lastCall![0] as ComponentProps<typeof ReviewZoomTrack>;
      expect([lane.duration, lane.time, lane.toOutputTime!(4)]).toEqual([2, 1, 2]);
      for (const label of ['Toggle', 'Link', 'Inspect link']) await click(label);
      expect(commands.toggleEnabled).toHaveBeenCalledTimes(direct ? 1 : 0);
      if (!direct) {
        expect(commands.change).not.toHaveBeenCalled();
        expect(commands.setLinkSelection).not.toHaveBeenCalled();
        allowed = true;
        for (const label of ['Toggle', 'Link', 'Inspect link']) await click(label);
      }
      expect(commands.change).toHaveBeenCalledWith('first', { linkTo: 'next' });
      expect(commands.setLinkSelection).toHaveBeenCalledWith('first');
    } finally {
      await act(async () => root.unmount());
    }
  }
);

it('audio edits retain their result-time values and the existing lane mutation owner', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  const audio = {
    assets: new Map(),
    selectedId: null,
    setSelectedId: vi.fn(),
    moveClip: vi.fn(),
    trimClip: vi.fn(),
    setOriginal: vi.fn(),
    toggleLaneMute: vi.fn(),
  };
  const state = createQuickEditAdvancedState().audio;
  const props = {
    audio,
    audioState: state,
    resultDuration: 3,
    edits: [],
    snapTimes: [0, 1, 3],
    busy: false,
    hasOriginalAudio: true,
    showAddedAudio: true,
    onOriginalRange: vi.fn(),
    onSelectSpeed: vi.fn(),
    onImportFile: vi.fn(),
    onRecordVoiceover: vi.fn(),
    selectedEditId: undefined,
  } as unknown as ComponentProps<typeof ReviewAudioLane>;
  try {
    await act(async () => root.render(<ReviewAudioLane {...props} />));
    const lane = observed.audio.mock.lastCall![0] as ComponentProps<typeof ReviewAudioTrack>;
    expect(lane.duration).toBe(3);
    expect(lane.audio).toBe(state);
    expect(lane.originalEditor).toBe(audio);
    for (const button of host.querySelectorAll<HTMLButtonElement>('button'))
      await act(async () => button.click());
    expect(audio.setSelectedId).toHaveBeenCalledWith('music');
    expect(audio.moveClip).toHaveBeenCalledWith('music', 'music', 1.5);
    expect(audio.trimClip).toHaveBeenCalledWith('music', 'music', 'end', 2);
  } finally {
    await act(async () => root.unmount());
  }
});
