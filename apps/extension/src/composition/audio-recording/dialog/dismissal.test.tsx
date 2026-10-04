// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useRecordingDismissal } from './dismissal';
import type { AudioRecordingControllerState } from '../session-types';

it('admits one close or replacement and rejects inactive, busy and duplicate confirmations', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let active = true;
  let busy = false;
  let retained = false;
  const take = new Blob(['voice']);
  const close = vi.fn(() => {
    active = false;
  });
  const restart = vi.fn();
  const pause = vi.fn();
  const controller: AudioRecordingControllerState = {
    meter: { status: 'paused', level: 0, peaks: [] },
    save: { audioBlob: take, trimStart: 1, trimEnd: 2, resetSession: vi.fn() },
    trim: null,
    transport: {
      status: 'recorded',
      elapsedSeconds: 2,
      durationLabel: '00:02',
      error: null,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      pauseRecording: pause,
      resumeRecording: vi.fn(),
    },
  };
  let latest!: ReturnType<typeof useRecordingDismissal>;
  function Harness() {
    latest = useRecordingDismissal({
      getController: () => controller,
      isActive: () => active,
      isBusy: () => busy,
      isRetained: (blob) => retained && blob === take,
      close,
      restart,
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    busy = true;
    act(() => latest.request('close'));
    expect(latest.open).toBe(false);
    busy = false;
    act(() => {
      latest.request('restart');
      latest.request('close');
    });
    expect(latest.open).toBe(true);
    expect(restart).not.toHaveBeenCalled();
    act(() => latest.cancel());
    expect(controller.save.audioBlob).toBe(take);
    act(() => latest.request('restart'));
    act(() => {
      latest.confirm();
      latest.confirm();
    });
    expect(restart).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    retained = true;
    act(() => {
      latest.request('close');
      latest.request('close');
    });
    expect(close).toHaveBeenCalledOnce();
    expect(latest.open).toBe(false);
    active = true;
    retained = false;
    controller.transport.status = 'paused';
    act(() => latest.request('close'));
    expect(pause).toHaveBeenCalledOnce();
    active = false;
    act(() => latest.confirm());
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
