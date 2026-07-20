// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

const { buttonMock } = vi.hoisted(() => ({
  buttonMock: vi.fn(),
}));

vi.mock('../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: any) => {
    buttonMock(props);
    return <button type="button">{props.label}</button>;
  },
}));

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { getQualityOption } from './settings/quality-card/options';
import { QualityCard } from './settings/quality-card/view';
import { ModeIconButton } from './setup/primitives';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(quality: VideoQuality): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality,
    systemAudioEnabled: true,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('resolves translated quality labels and patches selected quality changes', () => {
  const onSettingsChange = vi.fn();
  const low = QualityCard({
    onSettingsChange,
    settings: createSettings(VideoQuality.LOW),
  });

  expect(getQualityOption(VideoQuality.LOW)).toEqual(
    expect.objectContaining({
      description: 't:popup.labels.qualityLowDescription',
      label: 't:popup.labels.qualityLow',
    })
  );
  expect(low.props.options).toContainEqual(
    expect.objectContaining({
      description: 't:popup.labels.qualityUltraDescription',
      label: 't:popup.labels.qualityUltra',
      value: VideoQuality.ULTRA,
    })
  );

  low.props.onChange(VideoQuality.ULTRA);

  expect(onSettingsChange).toHaveBeenCalledWith({ quality: VideoQuality.ULTRA });
});

it('forwards the disabled state through the shared mode button helper', async () => {
  await renderNode(
    <ModeIconButton
      icon={() => <svg />}
      label="Window"
      hint="Hint"
      active={false}
      disabled
      accentClassName="accent"
      onClick={vi.fn()}
    />
  );

  expect(buttonMock).toHaveBeenCalledWith(
    expect.objectContaining({
      active: false,
      disabled: true,
      label: 'Window',
    })
  );
});
