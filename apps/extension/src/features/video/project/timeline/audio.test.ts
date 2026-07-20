import { describe, expect, it } from 'vitest';
import { getClipGainRange, getClipWaveformPeaks } from './audio';
import { VideoClipLinkMode, VideoProjectClipType } from '../types/index';

function createProject() {
  return {
    assets: [
      {
        id: 'audio-1',
        metadata: {
          audioPeaks: [0.1, 0.8, 0.25, 0.5],
          duration: 8,
        },
      },
    ],
  };
}

describe('timeline audio helpers', () => {
  it('prefers absolute gain fields and clamps legacy envelope values', () => {
    expect(
      getClipGainRange({
        audioGainEnd: 0.4,
        audioGainStart: 1.25,
        volume: 0.5,
      } as never)
    ).toEqual({ end: 0.4, start: 1.25 });

    expect(
      getClipGainRange({
        volume: 0.5,
        volumeEnvelopeEnd: 3,
        volumeEnvelopeStart: -1,
      } as never)
    ).toEqual({ end: 1, start: 0 });
  });

  it('samples waveform peaks across the active source range and ignores unsupported clips', () => {
    const project = createProject();
    const clip = {
      assetId: 'audio-1',
      duration: 2,
      linkMode: VideoClipLinkMode.DETACHED,
      sourceDuration: 4,
      sourceStart: 2,
      startTime: 1,
      type: VideoProjectClipType.AUDIO,
    };

    expect(getClipWaveformPeaks(project as never, clip as never, 4)).toEqual([
      0.8, 0.8, 0.8, 0.8, 0.25, 0.25, 0.25, 0.25,
    ]);
    expect(
      getClipWaveformPeaks(
        project as never,
        { ...clip, type: VideoProjectClipType.IMAGE } as never,
        4
      )
    ).toEqual([]);
    expect(getClipWaveformPeaks(project as never, clip as never, 0)).toEqual([]);
  });
});
