// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buttonMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('../../../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: any) => {
    mocks.buttonMock(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </button>
    );
  },
}));

import { VideoSystemAudioToggle } from './system-audio-toggle';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
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

it('renders the disabled system-audio state', () => {
  render(
    <VideoSystemAudioToggle
      settings={{ systemAudioEnabled: true } as never}
      systemAudioDisabled
      onSettingsChange={vi.fn()}
    />
  );

  expect(mocks.buttonMock).toHaveBeenCalledWith(
    expect.objectContaining({
      active: false,
      description: 'popup.video.systemAudioDisabledDescription',
      disabled: true,
      geometry: 'square',
      label: 'popup.video.systemAudioDisabledLabel',
    })
  );
});

it('renders the enabled state and toggles system audio on click', () => {
  const onSettingsChange = vi.fn();

  render(
    <VideoSystemAudioToggle
      settings={{ systemAudioEnabled: true } as never}
      systemAudioDisabled={false}
      onSettingsChange={onSettingsChange}
    />
  );
  act(() => {
    (container?.querySelector('button') as HTMLButtonElement).click();
  });

  expect(mocks.buttonMock).toHaveBeenCalledWith(
    expect.objectContaining({
      active: true,
      description: 'popup.video.systemAudioDescription',
      disabled: false,
      geometry: 'square',
      label: 'popup.video.systemAudioLabel',
    })
  );
  expect(onSettingsChange).toHaveBeenCalledWith({ systemAudioEnabled: false });
});
