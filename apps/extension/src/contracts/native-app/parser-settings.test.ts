import { describe, expect, it } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { parseNativeAppInboundMessage } from './index';
import { isNativeCaptureSettings, isNativeEffectiveSettings } from './parser-settings';

function createSettingsAccepted() {
  const native = DEFAULT_VIDEO_SETTINGS.native;
  if (!native) {
    throw new Error('Native video defaults are required for native app parser tests');
  }

  return {
    acceptedAtEpochMs: Date.now(),
    controllerLeaseId: 'lease-1',
    effectiveSettings: {
      ...native,
      warnings: [],
    },
    protocolVersion: 1,
    revision: 'settings-revision-1',
    schemaVersion: 1,
    type: 'app.settings.accepted',
    warnings: [],
  };
}

describe('native app effective settings parser', () => {
  it('rejects malformed native effective settings before status updates', () => {
    const accepted = createSettingsAccepted();

    expect(parseNativeAppInboundMessage(accepted)).toMatchObject({ ok: true });

    expect(
      parseNativeAppInboundMessage({
        ...accepted,
        effectiveSettings: {
          ...accepted.effectiveSettings,
          video: {
            ...accepted.effectiveSettings.video,
            advanced: {
              ...accepted.effectiveSettings.video.advanced,
              maxDurationMinutes: 1000,
            },
          },
        },
      })
    ).toMatchObject({ ok: false, reason: 'malformed-message' });

    expect(
      parseNativeAppInboundMessage({
        ...accepted,
        effectiveSettings: {
          screenshots: {},
          video: accepted.effectiveSettings.video,
          warnings: [],
        },
      })
    ).toMatchObject({ ok: false, reason: 'malformed-message' });
  });
});

describe('native app requested settings parser', () => {
  it('validates requested native settings and rejects malformed tray actions', () => {
    const native = DEFAULT_VIDEO_SETTINGS.native;
    if (!native) {
      throw new Error('Native defaults are required for native app parser tests');
    }

    expect(isNativeCaptureSettings(native)).toBe(true);
    expect(isNativeEffectiveSettings({ ...native, warnings: [] })).toBe(true);
    expect(isNativeCaptureSettings({ ...native, trayActions: {} })).toBe(false);
    expect(
      isNativeCaptureSettings({
        ...native,
        trayActions: {
          ...native.trayActions,
          openSettings: { ...native.trayActions.openSettings, shortcutLabel: 'x'.repeat(41) },
        },
      })
    ).toBe(false);
    expect(isNativeEffectiveSettings({ ...native, warnings: [{ code: 'clamped' }] })).toBe(true);
    expect(isNativeEffectiveSettings({ ...native, warnings: [{ code: 'unknown-code' }] })).toBe(
      false
    );
  });
});
