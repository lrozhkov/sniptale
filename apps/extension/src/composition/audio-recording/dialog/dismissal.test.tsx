// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RecordingDiscardConfirmation, useRecordingDismissal } from './dismissal';
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

it('places an opted-in confirmation outside the inspector and preserves its theme and cleanup', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let value!: ReturnType<typeof useRecordingDismissal>;
  const controller: AudioRecordingControllerState = {
    meter: { status: 'paused', level: 0, peaks: [] },
    save: { audioBlob: new Blob(['raw']), trimStart: 0, trimEnd: 2, resetSession: vi.fn() },
    transport: {
      status: 'recorded',
      elapsedSeconds: 2,
      durationLabel: '00:02',
      error: null,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      pauseRecording: vi.fn(),
      resumeRecording: vi.fn(),
    },
    trim: null,
  };
  function Subject() {
    value = useRecordingDismissal({
      getController: () => controller,
      isActive: () => true,
      isBusy: () => false,
      isRetained: () => false,
      close: vi.fn(),
      restart: vi.fn(),
    });
    return (
      <div data-theme="dark">
        <RecordingDiscardConfirmation portal value={value} />
      </div>
    );
  }
  try {
    act(() => root.render(<Subject />));
    act(() => value.request('close'));
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.closest('[data-theme]')?.getAttribute('data-theme')).toBe('dark');
    act(() => value.cancel());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
