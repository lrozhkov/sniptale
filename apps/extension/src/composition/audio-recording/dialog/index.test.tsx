// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MaterialAudioRecordingModal } from './index';
vi.mock('../../../platform/i18n', async (original) => {
  const module = await original<typeof import('../../../platform/i18n')>();
  return { ...module, translate: module.createTranslator('en') };
});
const io = vi.hoisted(() => ({ session: vi.fn(), encode: vi.fn(), pause: vi.fn() }));
vi.mock('../session', () => ({
  useAudioRecordingSession: io.session,
}));
vi.mock('../trim-file', () => ({
  createTrimmedRecordingFile: io.encode,
}));
vi.mock('./waveform', () => ({ useRecordedAudioPeaks: () => [0.2, 0.8] }));
let root: Root;
let host: HTMLDivElement;
const close = vi.fn();
const apply = vi.fn();
const source = new Blob(['recording']);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.session.mockReturnValue({
    transport: {
      status: 'recorded',
      durationLabel: '00:04',
      error: null,
      startRecording: vi.fn(async () => {}),
      stopRecording: vi.fn(),
    },
    save: { audioBlob: source, trimStart: 1, trimEnd: 3, resetSession: vi.fn() },
    trim: {
      audioRef: { current: null },
      audioUrl: 'blob:recording',
      trimStart: 1,
      trimEnd: 3,
      recordedDuration: 4,
      pauseSelection: io.pause,
      playSelection: vi.fn(),
      selectRange: vi.fn(),
      resolveDuration: vi.fn(),
    },
  });
  io.encode.mockResolvedValue(new File(['trimmed'], 'voice.wav', { type: 'audio/wav' }));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      <MaterialAudioRecordingModal
        isOpen
        onClose={close}
        saveLabel="Apply narration"
        onSave={async (file, _trim, signal) => {
          if (!(await apply(file, signal))) throw new Error('save failed');
        }}
      />
    )
  );
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((item) => item.textContent === text)!;
it('retains the recording after failed apply and retries the selected range', async () => {
  apply.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render();
  await act(async () => button('Apply narration').click());
  expect(io.encode).toHaveBeenCalledWith(source, 1, 3);
  expect(io.pause).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector('audio')).not.toBeNull();
  await act(async () => button('Apply narration').click());
  expect(apply).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
});
it('admits one save and aborts its intent when the selected slide is unmounted', async () => {
  let finish!: (accepted: boolean) => void;
  apply.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => {
    button('Apply narration').click();
    button('Apply narration').click();
  });
  expect(apply).toHaveBeenCalledOnce();
  expect(button('Cancel').disabled).toBe(true);
  const signal = apply.mock.calls[0]![1] as AbortSignal;
  act(() => root.unmount());
  root = createRoot(host);
  expect(signal.aborted).toBe(true);
  await act(async () => finish(true));
  expect(close).not.toHaveBeenCalled();
});
it('does not submit a late encoding result after closing the dialog', async () => {
  let finish!: (blob: Blob) => void;
  io.encode.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await render();
  await act(async () => button('Apply narration').click());
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => finish(new Blob(['late'])));
  expect(apply).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it('requires explicit dismissal and keeps Escape from discarding a draft', async () => {
  await render();
  act(() =>
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
  );
  expect(close).not.toHaveBeenCalled();
  act(() => button('Cancel').click());
  expect(close).toHaveBeenCalledOnce();
});

it('starts and stops capture, shows permission failure, and exposes the shared microphone control', async () => {
  const state = io.session();
  state.trim = null;
  state.save.audioBlob = null;
  state.transport.status = 'idle';
  await render();
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Microphone"]')).not.toBeNull();
  await act(async () => button('Start recording').click());
  expect(state.transport.startRecording).toHaveBeenCalledOnce();
  state.transport.status = 'recording';
  await render();
  act(() => button('Stop').click());
  expect(state.transport.stopRecording).toHaveBeenCalledOnce();
  state.transport.status = 'idle';
  state.transport.error = 'Permission denied';
  await render();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Permission denied');
  expect(button('Apply narration').disabled).toBe(true);
});

it('reports a failed capture start with the shared recorder error', async () => {
  const state = io.session();
  state.trim = null;
  state.save.audioBlob = null;
  state.transport.status = 'idle';
  state.transport.startRecording = vi.fn(async () => Promise.reject(new Error('no mic')));
  await render();
  await act(async () => button('Start recording').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Recording could not start. Try again.'
  );
  expect(close).not.toHaveBeenCalled();
});
