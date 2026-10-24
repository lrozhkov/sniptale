import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_HISTORY_MAX_AUDIO_BYTES } from '@sniptale/runtime-contracts/voice-input';
import { createVoiceAudioCapture } from './audio-capture';

function harness() {
  const recorders: Recorder[] = [];
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  const streams: MediaStreamTrack[][] = [];
  class Stream {
    constructor(tracks: MediaStreamTrack[]) {
      streams.push(tracks);
    }
  }
  class Recorder {
    state = 'recording';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn(() => {
      this.state = 'inactive';
    });
    constructor() {
      recorders.push(this);
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('MediaRecorder', Recorder);
  const limit = vi.fn();
  const capture = createVoiceAudioCapture(track, limit);
  return { capture, track, streams, limit, recorder: recorders[0]! };
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded voice audio capture', () => {
  it('borrows the acquired track and waits for final native data without stopping hardware', async () => {
    const { capture, track, streams, recorder } = harness();
    const completion = capture.finish();
    expect(streams).toEqual([[track]]);
    expect(recorder.stop).toHaveBeenCalledOnce();
    recorder.ondataavailable?.({ data: new Blob(['final']) });
    recorder.onstop?.();
    expect((await completion).audio.type).toBe('audio/webm;codecs=opus');
    expect(await (await completion).audio.text()).toBe('final');
    expect(track.stop).not.toHaveBeenCalled();
  });
  it('fails explicitly at the unchanged byte bound instead of dropping audio', async () => {
    const { capture, recorder, limit } = harness();
    recorder.ondataavailable?.({
      data: new Blob([new Uint8Array(VOICE_HISTORY_MAX_AUDIO_BYTES + 1)]),
    });
    expect(limit).toHaveBeenCalledOnce();
    const completion = capture.finish();
    recorder.onstop?.();
    await expect(completion).rejects.toThrow('too-large');
  });
  it('aborts without publishing final chunks or releasing the borrowed microphone', async () => {
    const { capture, recorder, track } = harness();
    capture.abort();
    expect(recorder.ondataavailable).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
    await expect(capture.finish()).rejects.toThrow('aborted');
  });
});
