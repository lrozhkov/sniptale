// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  stateButton: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: {
    active: boolean;
    description: string;
    disabled: boolean;
    label: string;
    onClick: () => void;
  }) => {
    mocks.stateButton(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </button>
    );
  },
}));

import { VideoSystemAudioToggle } from './system-audio-toggle';
import { createBodySettings } from '../body.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderToggle(args: {
  enabled: boolean;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  systemAudioDisabled: boolean;
}): void {
  container ??= document.createElement('div');
  root ??= createRoot(container);
  act(() =>
    root?.render(
      <VideoSystemAudioToggle
        onSettingsChange={args.onSettingsChange}
        settings={{ ...createBodySettings(), systemAudioEnabled: args.enabled }}
        systemAudioDisabled={args.systemAudioDisabled}
      />
    )
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('renders the disabled system-audio copy and blocks interaction', () => {
  const onSettingsChange = vi.fn();
  renderToggle({ enabled: true, onSettingsChange, systemAudioDisabled: true });
  act(() => container?.querySelector('button')?.click());

  expect(mocks.stateButton).toHaveBeenCalledWith(
    expect.objectContaining({
      active: false,
      description: 'popup.video.systemAudioDisabledDescription',
      disabled: true,
      label: 'popup.video.systemAudioDisabledLabel',
    })
  );
  expect(onSettingsChange).not.toHaveBeenCalled();
});

it.each([
  { current: false, next: true },
  { current: true, next: false },
])('renders enabled state and toggles $current to $next', ({ current, next }) => {
  const onSettingsChange = vi.fn();
  renderToggle({ enabled: current, onSettingsChange, systemAudioDisabled: false });
  act(() => container?.querySelector('button')?.click());

  expect(mocks.stateButton).toHaveBeenCalledWith(
    expect.objectContaining({
      active: current,
      description: 'popup.video.systemAudioDescription',
      disabled: false,
      label: 'popup.video.systemAudioLabel',
    })
  );
  expect(onSettingsChange).toHaveBeenCalledWith({ systemAudioEnabled: next });
});
