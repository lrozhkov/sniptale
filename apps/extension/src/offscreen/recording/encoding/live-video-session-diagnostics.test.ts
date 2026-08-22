import { describe, expect, it } from 'vitest';
import type { LiveVideoEncoderPumpMetrics } from './live-video-encoder-pump';
import { LiveVideoSessionDiagnostics } from './live-video-session-diagnostics';

const EMPTY_PUMP_METRICS: LiveVideoEncoderPumpMetrics = {
  coalescedVideoFrames: 0,
  forcedKeyFrames: 0,
  maxEncoderAddDurationMs: 0,
  maxFrameTransformDurationMs: 0,
  submittedVideoFrames: 0,
  totalEncoderAddDurationMs: 0,
  totalFrameTransformDurationMs: 0,
  transformedVideoFrames: 0,
  videoEncoderBackpressureEvents: 0,
};

function createDiagnostics(
  track: {
    getCapabilities?(): MediaTrackCapabilities;
    getConstraints?(): MediaTrackConstraints;
    getSettings?(): MediaTrackSettings;
  } = {}
) {
  return new LiveVideoSessionDiagnostics({
    configuredBitrate: 1_000_000,
    requestedFrameRate: 60,
    track,
  });
}

describe('LiveVideoSessionDiagnostics', () => {
  it('captures advisory track diagnostics without changing behavior', () => {
    const diagnostics = createDiagnostics({
      getCapabilities: () => ({ frameRate: { max: 60, min: 1 } }),
      getConstraints: () => ({ frameRate: 60 }),
      getSettings: () => ({ frameRate: 60, height: 720, width: 1280 }),
    });

    expect(diagnostics.captureTrack).toEqual({
      capabilities: { frameRate: { max: 60, min: 1 } },
      constraints: { frameRate: 60 },
      settings: { frameRate: 60, height: 720, width: 1280 },
    });
  });

  it('keeps track diagnostics nullable when browser methods throw', () => {
    const diagnostics = createDiagnostics({
      getCapabilities: () => {
        throw new Error('capabilities failed');
      },
      getConstraints: () => {
        throw new Error('constraints failed');
      },
      getSettings: () => {
        throw new Error('settings failed');
      },
    });

    expect(diagnostics.captureTrack).toEqual({
      capabilities: null,
      constraints: null,
      settings: null,
    });
  });

  it('summarizes source delivery, processor, encoder, and packet metrics together', () => {
    const diagnostics = createDiagnostics();
    diagnostics.observeSourceFrame({ timestamp: 1_000_000 });
    diagnostics.observeSourceFrame({ timestamp: 1_016_667 });
    diagnostics.observeSourceFrame({ timestamp: 1_066_667 });
    diagnostics.observeFrameBufferDepth(2);
    diagnostics.observeFrameBufferDepth(7);
    diagnostics.encoderSubmissionStarted();
    diagnostics.encoderSubmissionStarted();
    diagnostics.encoderSubmissionFailed();
    expect(
      diagnostics.observeEncodedPacket({
        byteLength: 80_000,
        duration: 1,
        timestamp: 0,
        type: 'key',
      })
    ).toEqual({
      firstPacket: true,
    });
    diagnostics.setPumpMetrics({
      ...EMPTY_PUMP_METRICS,
      coalescedVideoFrames: 1,
      forcedKeyFrames: 1,
      maxEncoderAddDurationMs: 12,
      maxFrameTransformDurationMs: 8,
      submittedVideoFrames: 3,
      totalEncoderAddDurationMs: 18,
      totalFrameTransformDurationMs: 16,
      transformedVideoFrames: 2,
      videoEncoderBackpressureEvents: 1,
    });

    expect(diagnostics.summarize({ processor: { discardedFrames: 4, totalFrames: 9 } })).toEqual(
      expect.objectContaining({
        actualKeyFrames: 1,
        averageEncoderAddDurationMs: 6,
        averageFrameTransformDurationMs: 8,
        coalescedVideoFrames: 1,
        encoderBackpressureEvents: 1,
        forcedKeyFrames: 1,
        maxEncoderAddDurationMs: 12,
        maxFrameBufferDepth: 7,
        maxFrameTransformDurationMs: 8,
        maxPendingEncodedPackets: 2,
        maxSourceFrameGapMs: 50,
        processorDiscardedFrames: 4,
        processorTotalFrames: 9,
        requestedFrameRate: 60,
        sourceDeliveryRatio: expect.closeTo(0.5, 3),
        sourceFrameRate: expect.closeTo(30, 3),
        sourceVideoFrames: 3,
        submittedVideoFrames: 3,
        transformedVideoFrames: 2,
      })
    );
  });

  it('ignores invalid optional processor counters', () => {
    const diagnostics = createDiagnostics();

    expect(
      diagnostics.summarize({
        processor: { discardedFrames: Number.NaN, totalFrames: '9' },
      })
    ).toEqual(
      expect.objectContaining({
        processorDiscardedFrames: null,
        processorTotalFrames: null,
      })
    );
  });
});
