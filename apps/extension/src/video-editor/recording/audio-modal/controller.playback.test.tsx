// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AudioRecordingControllerState } from '../../../composition/audio-recording/session-types';
import { useAudioRecordingController } from './controller';

const session = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/audio-recording/session', () => ({
  useAudioRecordingSession: session,
}));

it('pauses native playback before playing state is published, blocks busy playback, and releases Space', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const audio = document.createElement('audio');
  let paused = true;
  vi.spyOn(audio, 'paused', 'get').mockImplementation(() => paused);
  const play = vi.fn(async () => {
    paused = false;
  });
  const pause = vi.fn(() => {
    paused = true;
  });
  const controller: AudioRecordingControllerState = {
    save: { audioBlob: new Blob(), resetSession: vi.fn(), trimStart: 0, trimEnd: 4 },
    transport: {
      elapsedSeconds: 4,
      durationLabel: '00:04',
      error: null,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      status: 'recorded',
    },
    trim: {
      audioBlob: new Blob(),
      audioUrl: 'blob:audio',
      audioRef: { current: audio },
      recordedDuration: 4,
      trimStart: 0,
      trimEnd: 4,
      resolveDuration: vi.fn(),
      selectRange: vi.fn(),
      isPlayingSelection: false,
      playSelection: play,
      pauseSelection: pause,
    },
  };
  session.mockReturnValue(controller);
  function Subject({ open, disabled }: { open: boolean; disabled: boolean }) {
    useAudioRecordingController(open, disabled);
    return <button>Save</button>;
  }
  const space = () => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space' });
    act(() => {
      host.querySelector('button')!.dispatchEvent(event);
    });
    return event;
  };
  try {
    act(() => root.render(<Subject open disabled={false} />));
    expect(space().defaultPrevented).toBe(true);
    expect(paused).toBe(false);
    expect(space().defaultPrevented).toBe(true);
    expect(paused).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledOnce();
    act(() => root.render(<Subject open disabled />));
    expect(space().defaultPrevented).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    act(() => root.render(<Subject open={false} disabled={false} />));
    expect(space().defaultPrevented).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
