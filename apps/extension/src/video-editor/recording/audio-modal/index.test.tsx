// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioRecordingModal } from './index';
import { TimelineRecordingPanel } from './timeline-panel';

vi.mock('../../../composition/audio-recording/trim-file', () => ({
  createTrimmedRecordingFile: vi.fn(
    async () => new File(['audio'], 'take.wav', { type: 'audio/wav' })
  ),
}));

const controller = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('../../../composition/audio-recording/session', () => ({
  useAudioRecordingSession: () => {
    return {
      transport: {
        durationLabel: '00:04',
        error: null,
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
        status: 'recorded',
      },
      trim: { pauseSelection: vi.fn() },
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
  renderAudioRecordingTrimPanel: () => <input aria-label="Trim" defaultValue="1–4" />,
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
        controller={{
          save: { audioBlob: null, resetSession: vi.fn(), trimEnd: 0, trimStart: 0 },
          trim: null,
          transport: {
            elapsedSeconds: 3,
            durationLabel: '00:03',
            error: null,
            startRecording: vi.fn(),
            stopRecording: stop,
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
