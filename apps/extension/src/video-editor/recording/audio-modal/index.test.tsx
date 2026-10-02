// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioRecordingModal } from './index';
import { TimelineRecordingPanel } from './timeline-panel';

vi.mock('../../../composition/audio-recording/trim-file', () => ({
  createTrimmedRecordingFile: vi.fn(
    async () => new File(['audio'], 'take.wav', { type: 'audio/wav' })
  ),
}));

const controller = vi.hoisted(() => ({
  reset: vi.fn(),
  stop: vi.fn(),
  status: 'recorded',
  start: vi.fn(),
  captureDuration: 0,
}));
vi.mock('../../../composition/audio-recording/session', () => ({
  useAudioRecordingSession: (
    _open: boolean,
    _errors: unknown,
    _device: string,
    timeline?: { duration: number }
  ) => {
    controller.captureDuration = timeline?.duration ?? 0;
    return {
      transport: {
        durationLabel: '00:04',
        error: null,
        startRecording: controller.start,
        elapsedSeconds: 0,
        stopRecording: controller.stop,
        pauseRecording: vi.fn(),
        resumeRecording: vi.fn(),
        status: controller.status,
      },
      meter: { status: 'idle', level: 0, peaks: [] },
      trim: controller.status === 'idle' ? null : { pauseSelection: vi.fn() },
      save: {
        audioBlob: new Blob(['audio']),
        trimStart: 1,
        trimEnd: 4,
        resetSession: controller.reset,
      },
    };
  },
}));
vi.mock('../../../composition/audio-recording/dialog/trim', () => ({
  renderAudioRecordingTrimPanel: (
    trim: unknown,
    _busy: boolean,
    _compact?: boolean,
    header?: ReactNode
  ) =>
    trim ? (
      <>
        {header}
        <input aria-label="Trim" defaultValue="1–4" />
      </>
    ) : null,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  controller.status = 'recorded';
});

it('stops microphone capture when synchronized video playback ends', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controller.status = 'recording';
  document.body.append(host);
  root = createRoot(host);
  const props = {
    isOpen: true,
    playVideo: true,
    onSave: vi.fn(async () => undefined),
    onClose: vi.fn(),
    timeline: { startTime: 2, duration: 5, beforeStart: async () => undefined, onStop: vi.fn() },
  };
  await act(async () => root.render(<AudioRecordingModal {...props} playbackRunning />));
  await act(async () => root.render(<AudioRecordingModal {...props} playbackRunning={false} />));
  expect(controller.stop).toHaveBeenCalledOnce();
});
it('retains failed recording for retry and blocks duplicate saves and dismissal', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  let rejectSave!: (reason: Error) => void;
  const onSave = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
    )
    .mockResolvedValueOnce(undefined);
  const onClose = vi.fn();
  act(() => root.render(<AudioRecordingModal isOpen onSave={onSave} onClose={onClose} />));
  const save = () =>
    Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('recordAudioSave')
    )!;
  save().focus();
  await act(async () => {
    save().click();
    save().click();
    document.querySelector<HTMLButtonElement>('.sniptale-modal-close')!.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'common.actions.cancel')!
      .click();
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(save().disabled).toBe(true);
  expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  await act(async () => {
    rejectSave(new Error('destination unavailable'));
  });
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(controller.reset).not.toHaveBeenCalled();
  expect((document.querySelector('[aria-label="Trim"]') as HTMLInputElement).value).toBe('1–4');
  await act(async () => {
    save().click();
  });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave.mock.calls[1]![1]).toEqual({ trimStart: 1, trimEnd: 4 });
  expect(controller.reset).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows remaining interval time and stops recording from the compact timeline strip', () => {
  document.body.append(host);
  root = createRoot(host);
  const stop = vi.fn();
  act(() =>
    root.render(
      <TimelineRecordingPanel
        titleId="record"
        startTime={2}
        duration={5}
        starting={false}
        saving={false}
        error={null}
        device={<span>Microphone</span>}
        onStart={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDownload={vi.fn()}
        downloading={false}
        controller={{
          meter: { status: 'voice', level: 0.4, peaks: Array(16).fill(0.4) },
          save: { audioBlob: null, resetSession: vi.fn(), trimEnd: 0, trimStart: 0 },
          trim: null,
          transport: {
            elapsedSeconds: 3,
            durationLabel: '00:03',
            error: null,
            startRecording: vi.fn(),
            stopRecording: stop,
            pauseRecording: vi.fn(),
            resumeRecording: vi.fn(),
            status: 'recording',
          },
        }}
      />
    )
  );
  expect(
    host.querySelector('[data-ui="video-editor.audio-recording.limit"]')?.textContent
  ).toContain('00:02');
  const button = [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('videoEditor.app.recordAudioStop')
  )!;
  act(() => button.click());
  expect(stop).toHaveBeenCalledTimes(1);
});

it('normal recorder passes the numeric cap to capture while preserving its maximum and playback setting', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controller.status = 'idle';
  document.body.append(host);
  root = createRoot(host);
  const onPlayVideoChange = vi.fn();
  await act(async () =>
    root.render(
      <AudioRecordingModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        timeline={{
          startTime: 2,
          duration: 20,
          beforeStart: async () => undefined,
          onStop: vi.fn(),
        }}
        onPlayVideoChange={onPlayVideoChange}
      />
    )
  );
  expect(controller.captureDuration).toBe(20);
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(input.max).toBe('20');
  const setValue = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  setValue('8');
  expect(controller.captureDuration).toBe(8);
  expect(
    host.querySelector('[data-ui="video-editor.audio-recording.limit"]')?.textContent
  ).toContain('00:20');
  const start = [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('recordAudioStart')
  )!;
  setValue('21');
  expect(start.disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.duration-limit"]')!.click()
  );
  expect(start.disabled).toBe(false);
  expect(controller.captureDuration).toBe(20);
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.play-video"]')!.click()
  );
  expect(onPlayVideoChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(controller.start).not.toHaveBeenCalled();
});

it('keeps an invalid retained cap editable after a take and gates Again until repaired', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  controller.status = 'idle';
  const props = { isOpen: true, onClose: vi.fn(), onSave: vi.fn() };
  const render = (duration: number) =>
    act(() =>
      root.render(
        <AudioRecordingModal
          {...props}
          timeline={{ startTime: 2, duration, beforeStart: async () => undefined, onStop: vi.fn() }}
        />
      )
    );
  render(20);
  const change = (value: string) =>
    act(() => {
      const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  change('10');
  controller.status = 'recorded';
  render(5);
  const again = [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('recordAudioAgain')
  )!;
  expect(again.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('10');
  change('3');
  expect(again.disabled).toBe(false);
  expect(controller.captureDuration).toBe(3);
});

it.each(['close', 'Escape'])(
  'protects the timeline take through %s and restores it after cancelling',
  async (trigger) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    document.body.append(host);
    root = createRoot(host);
    const onClose = vi.fn();
    const props = {
      isOpen: true,
      onClose,
      onSave: vi.fn(),
      timeline: { startTime: 2, duration: 20, beforeStart: async () => undefined, onStop: vi.fn() },
    };
    await act(async () => root.render(<AudioRecordingModal {...props} />));
    const request = () =>
      act(() => {
        if (trigger === 'close')
          host.querySelector<HTMLButtonElement>('[title="common.actions.close"]')!.click();
        else
          host
            .querySelector('[role="dialog"]')!
            .dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
            );
      });
    request();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => root.render(<AudioRecordingModal {...props} />));
    expect(host.querySelector('[role="alertdialog"]')!.contains(document.activeElement)).toBe(true);
    act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector('[aria-label="Trim"]')).not.toBeNull();
    request();
    act(() =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'videoEditor.app.recordAudioDiscard')!
        .click()
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(controller.reset).toHaveBeenCalledOnce();
  }
);

it('keeps recorded take context and apply actions separate from playback', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <AudioRecordingModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        timeline={{
          startTime: 2,
          duration: 20,
          beforeStart: async () => undefined,
          onStop: vi.fn(),
        }}
      />
    )
  );
  const strip = document.querySelector('[data-ui="video-editor.audio-recording.strip"]')!;
  const title = strip.querySelector('[id]')!;
  const apply = [...strip.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('recordAudioInsert')
  )!;
  expect(title.closest('header')).not.toBeNull();
  expect(apply.closest('footer')).not.toBeNull();
  expect(apply.className).toContain('sniptale-color-accent');
  expect(strip.querySelector('header')?.textContent).toContain('00:02–00:22');
  expect(strip.querySelector('footer')?.textContent).toContain('recordAudioAgain');
});
