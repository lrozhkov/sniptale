// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAudioRecordingSession } from './session';
import type { AudioRecordingControllerState } from './session-types';

const errors = {
  noSupport: 'unsupported',
  permissionDenied: 'denied',
  startFailed: 'failed',
  playFailed: 'play failed',
};
let latest: AudioRecordingControllerState;
let root: Root;
let host: HTMLDivElement;
let stopped: ReturnType<typeof vi.fn>;
let acquire: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;
class Recorder extends EventTarget {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: new Blob(['voice']) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}
function Subject({ open = true }: { open?: boolean }) {
  latest = useAudioRecordingSession(open, errors);
  return latest.trim ? <audio ref={latest.trim.audioRef} src={latest.trim.audioUrl} /> : null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('MediaRecorder', Recorder);
  stopped = vi.fn();
  acquire = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopped }] });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: acquire } });
  revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: revoke });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Subject />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('reports unavailable recording and localized permission failure without publishing audio', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.error).toBe('unsupported');
  expect(acquire).not.toHaveBeenCalled();
  vi.stubGlobal('MediaRecorder', Recorder);
  acquire.mockRejectedValue(new Error('permission'));
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.error).toBe('denied');
  expect(latest.transport.status).toBe('idle');
  expect(latest.trim).toBeNull();
});
it('releases a late permission stream after the owning view closes', async () => {
  let finish!: (stream: unknown) => void;
  acquire.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = latest.transport.startRecording();
  });
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => {
    finish({ getTracks: () => [{ stop: stopped }] });
    await pending;
  });
  expect(stopped).toHaveBeenCalledOnce();
  expect(host.querySelector('audio')).toBeNull();
});
it('retains captured audio for trim and retry then releases its URL on unmount', async () => {
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.status).toBe('recording');
  await act(async () => latest.transport.stopRecording());
  expect(latest.transport.status).toBe('recorded');
  expect(stopped).toHaveBeenCalledOnce();
  await act(async () => {
    latest.trim!.resolveDuration(4);
    latest.trim!.selectRange({ start: 1, end: 3 });
  });
  const audio = host.querySelector('audio')!;
  const play = vi
    .spyOn(audio, 'play')
    .mockRejectedValueOnce(new Error('blocked'))
    .mockResolvedValue(undefined);
  await act(async () => latest.trim!.playSelection());
  expect(latest.transport.error).toBe('play failed');
  expect(latest.save.audioBlob?.size).toBe(5);
  expect(latest.save.trimStart).toBe(1);
  expect(latest.save.trimEnd).toBe(3);
  expect(audio.currentTime).toBe(1);
  await act(async () => latest.trim!.playSelection());
  expect(play).toHaveBeenCalledTimes(2);
  expect(latest.transport.error).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  expect(revoke).toHaveBeenCalledWith('blob:voice');
});
