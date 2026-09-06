// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioRecordingModal } from './index';

const controller = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('./controller', () => ({
  useAudioRecordingController: () => {
    return {
      transport: {
        durationLabel: '00:04',
        error: null,
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
        status: 'recorded',
      },
      trim: {},
      save: {
        audioBlob: new Blob(['audio']),
        trimStart: 1,
        trimEnd: 4,
        resetSession: controller.reset,
      },
    };
  },
}));
vi.mock('./trim', () => ({
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
  act(() => {
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
