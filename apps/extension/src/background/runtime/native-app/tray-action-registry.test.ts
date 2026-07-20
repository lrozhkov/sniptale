import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAppCapabilities } from '../../../contracts/native-app';
import type { QuickAction } from '../../../contracts/settings';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  currentLocale: 'en',
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    getCurrentLocale: () => mocks.currentLocale,
  };
});

beforeEach(() => {
  mocks.currentLocale = 'en';
});

it('uses i18n labels and hashes the label payload into the registry revision', async () => {
  const { createDefaultNativeTrayActionRegistry } = await import('./tray-action-registry');

  const english = await createDefaultNativeTrayActionRegistry();
  mocks.currentLocale = 'ru';
  const russian = await createDefaultNativeTrayActionRegistry();

  expect(english.actions.find((action) => action.id === 'open-settings')?.label).toBe(
    'Open Sniptale Settings'
  );
  expect(russian.actions.find((action) => action.id === 'open-settings')?.label).toBe(
    'Открыть настройки Sniptale'
  );
  expect(english.revision).toMatch(/^native-tray-sha256-/);
  expect(russian.revision).toMatch(/^native-tray-sha256-/);
  expect(russian.revision).not.toBe(english.revision);
});

it('does not advertise recording stop before a state-aware registry enables it', async () => {
  const { createDefaultNativeTrayActionRegistry } = await import('./tray-action-registry');

  await expect(createDefaultNativeTrayActionRegistry()).resolves.toEqual(
    expect.objectContaining({
      actions: expect.arrayContaining([
        expect.objectContaining({ enabled: false, id: 'stop-recording' }),
      ]),
    })
  );
});

it('derives recording controls from enabled recording start actions', async () => {
  const { createNativeTrayActionRegistry } = await import('./tray-action-registry');
  const native = DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings;
  const registry = await createNativeTrayActionRegistry({
    ...native,
    video: { ...native.video, enabled: true },
  });

  expect(registry.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ enabled: true, id: 'pause-recording' }),
      expect.objectContaining({ enabled: true, id: 'resume-recording' }),
      expect.objectContaining({ enabled: true, id: 'stop-recording' }),
    ])
  );
});

it('publishes browser-active extension shortcut priority for quick actions', async () => {
  const { createNativeTrayActionRegistry } = await import('./tray-action-registry');
  const native = DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings;
  const quickAction = {
    hotkey: { altKey: false, ctrlKey: true, key: 'ы', metaKey: false, shiftKey: false },
    status: true,
  } as QuickAction;

  await expect(createNativeTrayActionRegistry(native, null, [quickAction])).resolves.toEqual(
    expect.objectContaining({
      shortcutPriority: {
        shortcutLabels: ['Ctrl+S'],
        when: 'browser-active',
        winner: 'extension',
      },
    })
  );
});

it('publishes separate screenshot and recording region actions', async () => {
  const { createDefaultNativeTrayActionRegistry } = await import('./tray-action-registry');

  await expect(createDefaultNativeTrayActionRegistry()).resolves.toEqual(
    expect.objectContaining({
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-screenshot-region',
          kind: 'capture-screenshot',
          label: 'Region screenshot',
        }),
        expect.objectContaining({
          id: 'start-recording-region',
          kind: 'start-recording',
          label: 'Record region',
        }),
      ]),
    })
  );
});

it('marks tray actions unavailable when the connected app does not support their modes', async () => {
  const { createDefaultNativeTrayActionRegistry } = await import('./tray-action-registry');

  await expect(createDefaultNativeTrayActionRegistry(createCapabilities())).resolves.toEqual(
    expect.objectContaining({
      actions: expect.arrayContaining([
        expect.objectContaining({
          enabled: false,
          id: 'capture-screenshot-region',
          warning: 'Unavailable in the connected app',
        }),
        expect.objectContaining({
          enabled: false,
          id: 'start-recording-region',
          warning: 'Unavailable in the connected app',
        }),
      ]),
    })
  );
});

function createCapabilities(): NativeAppCapabilities {
  return {
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen', 'active-window', 'all-screens'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen', 'active-window'],
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    limits: {
      maxChunkBytes: 1,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1,
      maxScreenshotBytes: 1,
      maxWidth: 3840,
    },
  };
}
