import { nativeSettingsFixture } from './settings.test-support';
import { describe, expect, it } from 'vitest';

import { parseNativeAppInboundMessage } from './index';
import {
  isNativeCaptureSettings,
  isNativeEffectiveSettings,
  isNativeEffectiveQualitySettings,
} from './parser-settings';

function createSettingsAccepted() {
  const native = nativeSettingsFixture;
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
    protocolVersion: 2,
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
    const native = nativeSettingsFixture;
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

// Exact Desktop positive contract fixture: AppSettingsAcceptedMessage.
function createDesktopSettingsAccepted() {
  return {
    type: 'app.settings.accepted',
    protocolVersion: 2,
    controllerLeaseId: 'lease-1',
    revision: 'settings-revision-1',
    schemaVersion: 1,
    acceptedAtEpochMs: 1782770000001,
    effectiveSettings: {
      screenshots: {
        includeCursor: true,
      },
      video: {
        enabled: true,
        advanced: {
          audioBitrateKbps: 160,
          audioSourceMode: 'mixed',
          frameRate: 'auto',
          includeCursorInVideo: true,
          maxDurationMinutes: 240,
          preferHardwareEncoder: true,
          videoBitrateMbpsOverride: null,
        },
        codec: {
          audioCodec: 'aac',
          container: 'mp4',
          hardwareAcceleration: 'prefer',
          videoCodec: 'h264',
        },
        telemetry: {
          collectCursor: true,
          collectClicks: true,
          collectKeyEvents: true,
          collectTypingSpans: true,
          collectStaticSignals: true,
        },
      },
      warnings: [
        {
          code: 'deferred-evaluation',
          field: 'video.effectiveQuality',
          message: 'recording quality evaluation is deferred until source geometry is known',
        },
      ],
    },
    warnings: [
      {
        code: 'deferred-evaluation',
        field: 'video.effectiveQuality',
        message: 'recording quality evaluation is deferred until source geometry is known',
      },
    ],
  };
}

describe('Desktop deferred evaluation compatibility', () => {
  it('accepts the canonical Desktop settings snapshot with both warning arrays', () => {
    const message = createDesktopSettingsAccepted();
    expect(parseNativeAppInboundMessage(message)).toEqual({ ok: true, value: message });
  });

  it.each(['top-level', 'effective'] as const)(
    'rejects unknown and malformed %s warnings',
    (location) => {
      const invalidWarnings: unknown[] = [
        [{ code: 'future-unknown-warning' }],
        [{ code: 'deferred-evaluation', field: 1 }],
        [{ code: 'deferred-evaluation', field: 'x'.repeat(81) }],
        [{ code: 'deferred-evaluation', message: false }],
        [{ code: 'deferred-evaluation', message: 'x'.repeat(241) }],
        [{ message: 'missing code' }],
        [null],
        Array.from({ length: 33 }, () => ({ code: 'deferred-evaluation' })),
        { code: 'deferred-evaluation' },
      ];
      for (const warnings of invalidWarnings) {
        const message = createDesktopSettingsAccepted();
        const malformed =
          location === 'top-level'
            ? { ...message, warnings }
            : { ...message, effectiveSettings: { ...message.effectiveSettings, warnings } };
        expect(parseNativeAppInboundMessage(malformed)).toMatchObject({
          ok: false,
          reason: 'malformed-message',
        });
      }
    }
  );
});

it('preserves quality snapshot validation when deferred evaluation warnings are present', () => {
  const quality = {
    audioBitrateKbps: 160,
    audioSourceMode: 'mixed',
    frameRate: 'auto',
    quality: 'HIGH',
    videoBitrateMbpsOverride: null,
    effectiveAudioBitrateKbps: 160,
    effectiveFps: 30,
    effectiveVideoBitrateMbps: 12,
    encoder: 'hardware',
    warnings: [],
  };
  expect(isNativeEffectiveQualitySettings(quality)).toBe(true);
  expect(
    isNativeEffectiveQualitySettings({
      ...quality,
      warnings: createDesktopSettingsAccepted().warnings,
    })
  ).toBe(true);
  for (const malformed of [
    null,
    { ...quality, audioBitrateKbps: 0 },
    { ...quality, frameRate: 25 },
    { ...quality, videoBitrateMbpsOverride: 1 },
    { ...quality, effectiveAudioBitrateKbps: 0 },
    { ...quality, effectiveFps: 0 },
    { ...quality, effectiveVideoBitrateMbps: 0 },
    { ...quality, encoder: 'unverified' },
    { ...quality, warnings: [{ code: 'future-unknown-warning' }] },
  ])
    expect(isNativeEffectiveQualitySettings(malformed)).toBe(false);
});
