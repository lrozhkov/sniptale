// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeAppCapabilities } from '../../../contracts/native-app';
import { NATIVE_TRAY_ACTION_KEYS } from '@sniptale/runtime-contracts/video/types/native-settings';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeSettingsPanel } from './panel';
import { listNativeTrayActionFieldKeys } from './tray-action-config';

const DEFAULT_NATIVE_SETTINGS = DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('keeps every native tray action setting visible in the settings UI', () => {
  expect(listNativeTrayActionFieldKeys().sort()).toEqual([...NATIVE_TRAY_ACTION_KEYS].sort());
});

it('emits advanced and telemetry native settings updates from fields', async () => {
  const onChange = vi.fn();
  renderPanel(onChange);

  const numbers = [
    ...(container?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []),
  ];
  const switches = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[role="switch"]') ?? []),
  ];
  expect(container?.querySelector('input[type="checkbox"]')).toBeNull();
  expect(container?.textContent).toContain('Паузы без действий');
  expect(container?.textContent).not.toContain('Статичные/idle участки');

  await selectProductOption('Частота кадров', '60 FPS');
  await selectProductOption('Источник аудио', 'Системный звук');
  await selectProductOption('Битрейт аудио', '192 кбит/с');
  act(() => {
    changeNumber(numbers[0], '18');
    changeNumber(numbers[0], '');
    changeNumber(numbers[1], '45');
    for (const toggle of switches) {
      toggle.click();
    }
  });

  expectAdvancedAndTelemetryUpdates(onChange);
});

it('records tray shortcuts for screenshot and recording modes', async () => {
  const onChange = vi.fn();
  renderPanel(onChange);
  const regionScreenshot = findButton('Снимок области: Горячая клавиша');

  await recordShortcut(regionScreenshot, { altKey: true, key: 'S' });
  const regionRecording = findButton('Запись области: Горячая клавиша');
  await recordShortcut(regionRecording, { ctrlKey: true, shiftKey: true, key: 'U' });

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      trayActions: expect.objectContaining({
        captureRegionScreenshot: expect.objectContaining({ shortcutLabel: 'Alt+S' }),
      }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      trayActions: expect.objectContaining({
        startRegionRecording: expect.objectContaining({ shortcutLabel: 'Ctrl+Shift+U' }),
      }),
    })
  );
});

it('disables tray hotkeys for modes missing from native app capabilities', () => {
  const onChange = vi.fn();
  renderPanel(onChange, {
    capture: {
      screenshotModes: ['screen'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen'],
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    limits: {
      maxChunkBytes: 1,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1,
      maxScreenshotBytes: 1,
      maxWidth: 3840,
    },
  });

  expect(findButton('Снимок области: Горячая клавиша').disabled).toBe(true);
  expect(findButton('Запись области: Горячая клавиша').disabled).toBe(true);
  expect(container?.textContent).toContain('Недоступно в подключенном приложении');
});

it('rejects duplicate tray shortcuts before saving', async () => {
  const onChange = vi.fn();
  renderPanel(onChange, null, {
    trayActions: {
      ...DEFAULT_NATIVE_SETTINGS.trayActions,
      captureRegionScreenshot: {
        ...DEFAULT_NATIVE_SETTINGS.trayActions.captureRegionScreenshot,
        shortcutLabel: 'Ctrl+S',
      },
    },
  });
  const regionRecording = findButton('Запись области: Горячая клавиша');

  await recordShortcut(regionRecording, { code: 'KeyS', ctrlKey: true, key: 'ы' });

  expect(container?.textContent).toContain('Это сочетание уже используется');
  expect(onChange).not.toHaveBeenCalledWith(
    expect.objectContaining({
      trayActions: expect.objectContaining({
        startRegionRecording: expect.objectContaining({ shortcutLabel: 'Ctrl+S' }),
      }),
    })
  );
});

it('derives recording control hotkey availability from enabled recording actions', () => {
  const onChange = vi.fn();
  renderPanel(onChange, null, {
    trayActions: {
      ...DEFAULT_NATIVE_SETTINGS.trayActions,
      startRegionRecording: {
        ...DEFAULT_NATIVE_SETTINGS.trayActions.startRegionRecording,
        enabled: false,
      },
      startScreenRecording: {
        ...DEFAULT_NATIVE_SETTINGS.trayActions.startScreenRecording,
        enabled: false,
      },
      startWindowRecording: {
        ...DEFAULT_NATIVE_SETTINGS.trayActions.startWindowRecording,
        enabled: false,
      },
    },
    video: { ...DEFAULT_NATIVE_SETTINGS.video, enabled: true },
  });
  const pauseHotkey = findButton('Пауза записи: Горячая клавиша');

  expect(pauseHotkey.disabled).toBe(true);
  expect(pauseHotkey.closest('.grid')?.querySelector('button[role="switch"]')).toBeNull();
});

function expectAdvancedAndTelemetryUpdates(onChange: ReturnType<typeof vi.fn>): void {
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({
        advanced: expect.objectContaining({ frameRate: 60 }),
      }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({
        advanced: expect.objectContaining({ audioSourceMode: 'system' }),
      }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({
        advanced: expect.objectContaining({ videoBitrateMbpsOverride: null }),
      }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({
        telemetry: expect.objectContaining({ collectStaticSignals: false }),
      }),
    })
  );
}

function renderPanel(
  onChange: (settings: NativeCaptureSettings) => void,
  capabilities: NativeAppCapabilities | null = null,
  settingsPatch: Partial<NativeCaptureSettings> = {}
): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <NativeSettingsPanel
        capabilities={capabilities}
        disabled={false}
        onChange={onChange}
        settings={{ ...DEFAULT_NATIVE_SETTINGS, ...settingsPatch }}
      />
    );
  });
}

async function selectProductOption(label: string, optionLabel: string): Promise<void> {
  const trigger = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger?.click();
  });
  const target = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
  ].find((node) => node.textContent?.trim() === optionLabel);
  const optionTexts = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
  ].map((node) => node.textContent?.trim());
  expect(target, `Missing option "${optionLabel}" in ${optionTexts.join(', ')}`).toBeTruthy();
  await act(async () => {
    target?.click();
  });
}

function changeNumber(input: HTMLInputElement | undefined, value: string): void {
  if (!input) {
    return;
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function findButton(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function recordShortcut(
  button: HTMLButtonElement,
  init: Pick<KeyboardEventInit, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>
): Promise<void> {
  await act(async () => {
    button.click();
  });
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}
