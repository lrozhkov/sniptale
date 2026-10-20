// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const { persistVideoSettingsMock } = vi.hoisted(() => ({ persistVideoSettingsMock: vi.fn() }));

vi.mock('../../persistence', () => ({ persistVideoSettings: persistVideoSettingsMock }));
vi.mock('../../../../platform/i18n/popup', () => ({ translate: (key: string) => key }));

import { useVideoStartConfirmation } from './start-confirmation';

function ConfirmationHarness(props: Parameters<typeof useVideoStartConfirmation>[0]) {
  const confirmation = useVideoStartConfirmation(props);
  return <>{confirmation.confirmation ?? <button onClick={confirmation.start}>Start</button>}</>;
}

type HarnessProps = ComponentProps<typeof ConfirmationHarness>;

let container: HTMLDivElement;
let root: Root;
let props: HarnessProps;

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function render(overrides: Partial<HarnessProps> = {}) {
  props = { ...props, ...overrides };
  await act(async () => root.render(<ConfirmationHarness {...props} />));
}

function button(label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label)
  );
  if (!result) {
    throw new Error(`Missing button: ${label}`);
  }
  return result;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function remember() {
  await act(async () => container.querySelector<HTMLInputElement>('input')?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  persistVideoSettingsMock.mockReset();
  persistVideoSettingsMock.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    warnWithoutMicrophone: false,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  props = {
    canStart: true,
    settings: { ...DEFAULT_VIDEO_SETTINGS },
    activeRecordingId: null,
    recordingState: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPresetId: null,
    },
    onStart: vi.fn(),
    onSettingsChange: vi.fn(),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('offers confirmation before starting with an absent preference and disabled microphone', async () => {
  const settings = { ...DEFAULT_VIDEO_SETTINGS };
  delete settings.warnWithoutMicrophone;
  await render({ settings });
  await click('Start');
  expect(props.onStart).not.toHaveBeenCalled();
  expect(container.textContent).toContain('withoutMicrophoneTitle');
  await click('withoutMicrophoneContinue');
  expect(props.onStart).toHaveBeenCalledTimes(1);
  expect(persistVideoSettingsMock).not.toHaveBeenCalled();
});

it.each(['cancel', 'escape'])(
  'dismisses with %s without saving the checked choice',
  async (action) => {
    await render();
    await click('Start');
    await remember();
    if (action === 'cancel') {
      await click('withoutMicrophoneCancel');
    } else {
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      );
    }
    expect(props.onStart).not.toHaveBeenCalled();
    expect(persistVideoSettingsMock).not.toHaveBeenCalled();
    expect(button('Start')).toBeTruthy();
  }
);

it.each([{ microphoneEnabled: true }, { warnWithoutMicrophone: false }])(
  'starts directly when microphone is enabled or warning is disabled: %j',
  async (settings) => {
    await render({ settings: { ...DEFAULT_VIDEO_SETTINGS, ...settings } });
    await click('Start');
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(persistVideoSettingsMock).not.toHaveBeenCalled();
  }
);

it('waits for durable opt-out before publishing settings and starting once', async () => {
  const save = deferred();
  persistVideoSettingsMock.mockReturnValue(save.promise);
  await render();
  await click('Start');
  await remember();
  const continueButton = button('withoutMicrophoneContinue');
  await act(async () => {
    continueButton.click();
    continueButton.click();
  });
  expect(persistVideoSettingsMock).toHaveBeenCalledExactlyOnceWith({
    warnWithoutMicrophone: false,
  });
  expect(props.onSettingsChange).not.toHaveBeenCalled();
  expect(props.onStart).not.toHaveBeenCalled();
  await act(async () => save.resolve());
  expect(props.onSettingsChange).toHaveBeenCalledExactlyOnceWith({ warnWithoutMicrophone: false });
  expect(props.onStart).toHaveBeenCalledTimes(1);
});

it('ignores duplicate Continue events without a preference save', async () => {
  await render();
  await click('Start');
  const continueButton = button('withoutMicrophoneContinue');
  await act(async () => {
    continueButton.click();
    continueButton.click();
  });
  expect(props.onStart).toHaveBeenCalledTimes(1);
});

it.each(['retry', 'uncheck'])(
  'recovers from a failed preference save through %s',
  async (action) => {
    persistVideoSettingsMock.mockRejectedValueOnce(new Error('storage unavailable'));
    await render();
    await click('Start');
    await remember();
    await click('withoutMicrophoneContinue');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'withoutMicrophoneSaveError'
    );
    expect(props.onSettingsChange).not.toHaveBeenCalled();
    expect(props.onStart).not.toHaveBeenCalled();
    if (action === 'uncheck') {
      await remember();
    }
    await click('withoutMicrophoneContinue');
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(persistVideoSettingsMock).toHaveBeenCalledTimes(action === 'retry' ? 2 : 1);
    expect(props.onSettingsChange).toHaveBeenCalledTimes(action === 'retry' ? 1 : 0);
  }
);

it.each(['cancel', 'escape', 'unmount', 'status', 'microphone', 'disabled', 'identity'])(
  'prevents late Start after %s during a pending save',
  async (action) => {
    const save = deferred();
    persistVideoSettingsMock.mockReturnValue(save.promise);
    await render();
    await click('Start');
    await remember();
    await click('withoutMicrophoneContinue');
    if (action === 'cancel') {
      await click('withoutMicrophoneCancel');
    } else if (action === 'escape') {
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      );
    } else if (action === 'unmount') {
      await act(async () => root.render(null));
    } else if (action === 'status') {
      await render({
        recordingState: { ...props.recordingState, status: VideoRecordingStatus.PREPARING },
      });
    } else if (action === 'microphone') {
      await render({ settings: { ...props.settings, microphoneEnabled: true } });
    } else if (action === 'identity') {
      await render({ activeRecordingId: 'new-recording' });
    } else {
      await render({ canStart: false });
    }
    await act(async () => save.resolve());
    expect(props.onStart).not.toHaveBeenCalled();
    expect(props.onSettingsChange).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('withoutMicrophoneTitle');
  }
);

it('checks canStart before showing a confirmation', async () => {
  await render({ canStart: false });
  await click('Start');
  expect(container.textContent).not.toContain('withoutMicrophoneTitle');
  expect(props.onStart).not.toHaveBeenCalled();
});
