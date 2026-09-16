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
  try {
    await act(async () =>
      root.render(<AudioRecordingDeviceSelect value="mic" onChange={() => {}} disabled={false} />)
    );
    expect(host.textContent).toContain('Desk microphone');
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
