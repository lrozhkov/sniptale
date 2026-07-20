import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createTelemetry(overrides: Record<string, unknown> = {}) {
  return {
    actionEvents: [
      {
        data: { button: 0 },
        duration: 0.4,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.2,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: createCursorTrack(),
    recordingId: 'recording-1',
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle',
        point: null,
        startTime: 0.2,
      },
    ],
    updatedAt: 2,
    viewport: createViewport(),
    ...overrides,
  };
}

function createCursorTrack() {
  return {
    captureMode: 'separate',
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  };
}

function createViewport() {
  return {
    devicePixelRatio: 2,
    height: 720,
    outerHeight: 860,
    outerWidth: 1300,
    scrollX: 0,
    scrollY: 100,
    viewportOffsetX: 10,
    viewportOffsetY: 30,
    width: 1280,
  };
}

describe('media hub backup telemetry metadata normalizer', () => {
  it('normalizes null and non-null optional telemetry fields', async () => {
    const { normalizeRecordingTelemetry } = await import('./blobs');

    expect(normalizeRecordingTelemetry(createTelemetry())).not.toHaveProperty('displaySurface');
    expect(
      normalizeRecordingTelemetry(
        createTelemetry({
          displaySurface: 'browser',
        })
      )
    ).toEqual(expect.objectContaining({ captureMode: 'TAB', displaySurface: 'browser' }));
    expect(normalizeRecordingTelemetry(createTelemetry({ displaySurface: null }))).toEqual(
      expect.objectContaining({ displaySurface: null })
    );
  });
});

describe('media hub backup blob metadata normalizer', () => {
  it('normalizes allowed blob entry fields and rejects unidentifiable entries', async () => {
    const { normalizeBlobDescriptor } = await import('./blobs');

    expect(
      normalizeBlobDescriptor(
        {
          blobPath: 'video-projects/video-1/assets/asset-1',
          entry: { id: 'asset-1', ignored: 'drop-me', mimeType: 'image/png', size: 10 },
        },
        ['video-projects/video-1/']
      )
    ).toEqual({
      blobPath: 'video-projects/video-1/assets/asset-1',
      entry: { id: 'asset-1', mimeType: 'image/png', size: 10 },
    });
    expect(() =>
      normalizeBlobDescriptor(
        { blobPath: 'video-projects/video-1/assets/asset-1', entry: { size: 10 } },
        ['video-projects/video-1/']
      )
    ).toThrow('shared.mediaHub.backupMetadataCorrupted');
  });
});
