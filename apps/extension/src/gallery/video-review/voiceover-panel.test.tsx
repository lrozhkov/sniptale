// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewVoiceoverRecording } from './voiceover-panel';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderRecording = (isOpen: boolean) => {
  const onClose = vi.fn();
  const onSave = vi.fn(async () => undefined);
  act(() => {
    root.render(
      <ReviewVoiceoverRecording
        isOpen={isOpen}
        playhead={3}
        onClose={onClose}
        onSyncStart={vi.fn(async () => undefined)}
        onSyncStop={vi.fn()}
        onSave={onSave}
      />
    );
  });
  return { onClose, onSave };
};

it('shows a bottom strip with an optional visible duration cap', () => {
  renderRecording(true);
  const modal = host.querySelector('[role="dialog"]');
  expect(modal).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.voiceoverStrip"]')).not.toBeNull();
  expect(modal!.textContent).toContain('gallery.videoReview.recordVoiceover');
  expect(modal!.textContent).toContain('videoEditor.app.recordAudioStart');
  expect(modal!.textContent).toContain('gallery.videoReview.voiceoverDurationLimit');
  const limit = modal!.querySelector<HTMLButtonElement>(
    '[data-ui="audio-recording.duration-limit"]'
  )!;
  expect(limit.getAttribute('role')).toBe('switch');
  expect(limit.getAttribute('aria-checked')).toBe('true');
  const duration = modal!.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(duration.value).toBe('60');
  expect(duration.max).toBe('');
  act(() => limit.click());
  expect(limit.getAttribute('aria-checked')).toBe('false');
  expect(modal!.querySelector('input[type="number"]')).toBeNull();
  expect(modal!.textContent).not.toContain('videoEditor.app.recordAudioLimit');
});

it('offers a visible video playback choice before capture and keeps the placement visible', () => {
  renderRecording(true);
  const playback = host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.play-video"]');
  expect(playback?.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('00:03');
  act(() => playback?.click());
  expect(playback?.getAttribute('aria-checked')).toBe('false');
});

it('stays closed when isOpen is false', () => {
  renderRecording(false);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('shows recording, pause, resume and take review with the same lower panel', async () => {
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
    }
    pause() {
      this.state = 'paused';
    }
    resume() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['voice']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }] }),
      enumerateDevices: async () => [],
    },
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  renderRecording(true);
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  const setNumber = (node: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  setNumber(input, '5');
  const click = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes(label)
    )!;
    await act(async () => button.click());
  };
  await click('videoEditor.app.recordAudioStart');
  expect(host.textContent).toContain('videoEditor.app.recordAudioPause');
  await click('videoEditor.app.recordAudioPause');
  expect(host.textContent).toContain('videoEditor.app.recordAudioResume');
  await click('videoEditor.app.recordAudioResume');
  await click('videoEditor.app.recordAudioStop');
  expect(host.textContent).toContain('videoEditor.app.recordAudioSave');
  expect(host.textContent).toContain('videoEditor.app.recordAudioAgain');
  act(() =>
    root.render(
      <ReviewVoiceoverRecording
        isOpen
        playhead={3}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSyncStart={vi.fn(async () => undefined)}
        onSyncStop={vi.fn()}
      />
    )
  );
  const again = [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('recordAudioAgain')
  )!;
  expect(again.disabled).toBe(false);
  expect(host.querySelector('input[type="number"]')).toBeNull();
});

it('shows elapsed time without a duplicate maximum in the ready transport', () => {
  renderRecording(true);
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '3');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[role="status"]')?.textContent).toContain('00:00');
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.duration-limit"]')!.click()
  );
  expect(host.querySelector('[role="status"]')?.textContent).toContain('00:00');
});

it.each([false, true])('uses only the optional capture limit (enabled=%s)', async (limited) => {
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
    }
    pause() {
      this.state = 'paused';
    }
    resume() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['voice']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }] }),
      enumerateDevices: async () => [],
    },
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );

  vi.useFakeTimers();
  try {
    renderRecording(true);
    if (!limited)
      act(() =>
        host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.duration-limit"]')!.click()
      );
    const start = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('recordAudioStart')
    )!;
    await act(async () => start.click());
    await act(async () => vi.advanceTimersByTime(59000));
    expect(host.textContent).toContain('recordAudioPause');
    await act(async () => vi.advanceTimersByTime(1500));
    expect(host.textContent).toContain(limited ? 'recordAudioSave' : 'recordAudioPause');
    if (!limited) {
      expect(host.querySelector('[role="status"]')?.textContent).toContain('01:00');
      const stop = [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('recordAudioStop')
      )!;
      await act(async () => stop.click());
      expect(host.textContent).toContain('recordAudioSave');
    }
  } finally {
    vi.useRealTimers();
  }
});
