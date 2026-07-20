// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

import { VideoDiagnosticsToggle } from './diagnostics-toggle';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    ...overrides,
  };
}

function renderToggle(props: Partial<ComponentProps<typeof VideoDiagnosticsToggle>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <VideoDiagnosticsToggle
        diagnosticsDisabled={false}
        onSettingsChange={vi.fn()}
        settings={createSettings()}
        {...props}
      />
    );
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

describe('video diagnostics toggle', () => {
  it('exports the diagnostics toggle component', () => {
    expect(VideoDiagnosticsToggle).toBeTypeOf('function');
  });

  it('shows browser activity diagnostics disclosure before enabling diagnostics', () => {
    const onSettingsChange = vi.fn();
    renderToggle({ onSettingsChange });

    const disclosure = container?.querySelector('[data-ui="popup.video.diagnostics-disclosure"]');
    expect(disclosure).toBeNull();

    const button = container?.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(button?.getAttribute('title')).toContain('расширенную диагностику');

    const confirmation = container?.querySelector(
      '[data-ui="popup.video.diagnostics-confirmation"]'
    );
    expect(confirmation?.textContent).toContain('расширенную диагностику');
    expect(confirmation?.textContent).toContain('IndexedDB');
    expect(confirmation?.textContent).toContain('JSON/ZIP');
    expect(confirmation?.textContent).toContain('Включить');

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('[data-ui="popup.video.diagnostics-confirm"]')
        ?.click();
    });

    expect(onSettingsChange).toHaveBeenCalledWith({ diagnosticsEnabled: true });
  });

  it('discloses that diagnostics are disabled for unsupported capture modes', () => {
    renderToggle({ diagnosticsDisabled: true });

    const button = container?.querySelector('button');
    expect(container?.textContent).not.toContain('screen preset');
    expect(button?.getAttribute('title')).toContain('расширенную диагностику');
    expect(button).toHaveProperty('disabled', true);
  });
});
