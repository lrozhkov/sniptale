// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('./media-device-selector', (_importOriginal) => ({
  VideoMediaDeviceSelector: (props: {
    currentDeviceId: string | null;
    label: string;
    onDeviceChange: (deviceId: string | null) => void;
    secondaryAction?: { label: string };
  }) => (
    <div>
      <button type="button" onClick={() => props.onDeviceChange('mic-2')}>
        {props.label}:{props.currentDeviceId}
      </button>
      {props.secondaryAction ? <span>{props.secondaryAction.label}</span> : null}
    </div>
  ),
}));

import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMicrophoneSelector } from './microphone-selector';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createSettings(enabled = true) {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: enabled,
    openEditorAfterRecording: false,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
    webcamDeviceId: null,
    webcamEnabled: false,
  };
}

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('hides until microphone capture is enabled', () => {
  renderNode(
    <VideoMicrophoneSelector
      settings={createSettings(false)}
      microphoneDevices={[]}
      isLoadingMicrophones={false}
      onMicrophoneDeviceChange={() => undefined}
      onSettingsChange={() => undefined}
    />
  );

  expect(container?.textContent ?? '').toBe('');
});

it('passes microphone selector state and selected device changes through the generic selector', () => {
  const onMicrophoneDeviceChange = vi.fn();

  renderNode(
    <VideoMicrophoneSelector
      settings={createSettings()}
      microphoneDevices={[{ deviceId: 'mic-2', label: 'USB Mic' }]}
      isLoadingMicrophones={false}
      onMicrophoneDeviceChange={onMicrophoneDeviceChange}
      onSettingsChange={() => undefined}
    />
  );

  expect(container?.textContent).toContain('t:popup.video.microphoneRowLabel:mic-1');
  expect(container?.textContent).toContain('t:popup.video.microphoneSettingsAction');
  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });
  expect(onMicrophoneDeviceChange).toHaveBeenCalledWith('mic-2');
});
