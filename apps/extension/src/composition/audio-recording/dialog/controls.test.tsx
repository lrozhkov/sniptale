// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mic } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  AudioRecordingDeviceSelect,
  AudioRecordingSaveButton,
  AudioRecordingTransport,
  RecordingActionButton,
} from './controls';

describe('audio-recording-modal/controls', () => {
  it('renders recording and save actions through product action buttons', () => {
    const recordingMarkup = renderToStaticMarkup(
      <RecordingActionButton
        icon={<Mic size={16} />}
        label="videoEditor.app.recordAudioStart"
        onClick={() => undefined}
      />
    );
    const saveMarkup = renderToStaticMarkup(
      <AudioRecordingSaveButton audioBlob={null} disabled={false} onSave={async () => undefined} />
    );

    expect(recordingMarkup).toContain('inline-flex h-10 min-h-10');
    expect(recordingMarkup).toContain('text-[var(--sniptale-color-text-primary)]');
    expect(saveMarkup).toContain('inline-flex h-10 min-h-10');
    expect(saveMarkup).toContain('disabled=""');
  });
});

it('lists microphones, refreshes device changes and removes its listener on close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const events = new EventTarget();
  const enumerateDevices = vi.fn().mockResolvedValue([
    { kind: 'audioinput', deviceId: 'mic', label: 'Desk microphone' },
    { kind: 'audioinput', deviceId: 'unnamed', label: '' },
    { kind: 'videoinput', deviceId: 'camera', label: 'Camera' },
  ]);
  const removeEventListener = vi.fn(events.removeEventListener.bind(events));
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener,
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <AudioRecordingDeviceSelect
          value="mic"
          onChange={onChange}
          disabled={false}
          menuClassName="sniptale-parameter-menu"
        />
      )
    );
    expect(host.textContent).toContain('Desk microphone');
    const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    const name = [...host.querySelectorAll<HTMLElement>('label,span')].find(
      (node) => node.textContent === 'videoEditor.app.recordAudioDevice'
    )!;
    await act(async () => name.click());
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => trigger.click());
    expect(document.querySelector('[role="listbox"]')?.className).toContain(
      'sniptale-parameter-menu'
    );
    const unnamed = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('videoEditor.app.recordAudioDevice 2')
    )!;
    await act(async () => unnamed.click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('unnamed');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await act(async () =>
      root.render(<AudioRecordingDeviceSelect value="mic" onChange={onChange} disabled />)
    );
    await act(async () => trigger.click());
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    enumerateDevices.mockResolvedValue([]);
    await act(async () => events.dispatchEvent(new Event('devicechange')));
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain('Desk microphone');
  } finally {
    act(() => root.unmount());
    host.remove();
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.unstubAllGlobals();
  }
  expect(removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
});

it('keeps recording transport commands distinct through idle, pause, resume and completed takes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const start = vi.fn();
  const stop = vi.fn();
  const pause = vi.fn();
  const resume = vi.fn(async () => undefined);
  const render = async (
    status: 'idle' | 'recording' | 'paused' | 'recorded',
    compact: boolean,
    error: string | null = null
  ) => {
    await act(async () =>
      root.render(
        <AudioRecordingTransport
          status={status}
          compact={compact}
          durationLabel="00:04"
          error={error}
          onStartRecording={start}
          onStopRecording={stop}
          onPauseRecording={pause}
          onResumeRecording={resume}
        />
      )
    );
  };
  const click = async (key: string) => {
    const action = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === `videoEditor.app.${key}`
    );
    expect(action).toBeDefined();
    await act(async () => action!.click());
  };
  try {
    await render('idle', false);
    await click('recordAudioStart');
    expect(start).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('recordAudioDescription');
    await render('recording', true);
    expect(host.textContent).not.toContain('recordAudioDescription');
    await click('recordAudioPause');
    await click('recordAudioStop');
    expect(pause).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    await render('paused', false, 'Capture failed');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Capture failed');
    await click('recordAudioResume');
    expect(resume).toHaveBeenCalledOnce();
    await render('recorded', true);
    expect(host.textContent).toContain('00:04');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click('recordAudioAgain');
    expect(start).toHaveBeenCalledTimes(2);
    await render('recorded', false, 'Save failed');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Save failed');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('names the explicit save destination while refusing absent or disabled takes', () => {
  const take = new Blob(['recording']);
  for (const destination of ['timeline', 'materials'] as const) {
    const markup = renderToStaticMarkup(
      <AudioRecordingSaveButton
        audioBlob={take}
        destination={destination}
        disabled={false}
        onSave={async () => undefined}
      />
    );
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(
      destination === 'materials' ? 'recordAudioSaveMaterial' : 'recordAudioSave'
    );
  }
  const disabled = renderToStaticMarkup(
    <AudioRecordingSaveButton
      audioBlob={take}
      label="Keep take"
      disabled
      onSave={async () => undefined}
    />
  );
  expect(disabled).toContain('Keep take');
  expect(disabled).toContain('disabled=""');
});
