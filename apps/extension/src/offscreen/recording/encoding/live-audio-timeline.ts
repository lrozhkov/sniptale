import type { AudioSample } from 'mediabunny';

/** Keeps sub-packet capture-clock jitter from manufacturing silence before encoding. */
export function createLiveAudioTimestampTransform() {
  let anchor: number | null = null;
  let frames = 0;
  let sampleRate = 0;

  return (sample: AudioSample): AudioSample => {
    const expected = anchor === null ? sample.timestamp : anchor + frames / sampleRate;
    const phaseFrames = Math.round((sample.timestamp - expected) * sample.sampleRate);
    // A full missing packet must retain its gap. Within half a packet, the nearest
    // continuous sample position is unambiguous; keep PCM and the original A/V origin.
    if (
      anchor === null ||
      sampleRate !== sample.sampleRate ||
      Math.abs(phaseFrames) >= sample.numberOfFrames / 2
    ) {
      anchor = sample.timestamp;
      frames = 0;
      sampleRate = sample.sampleRate;
    } else {
      sample.setTimestamp(expected);
    }
    frames += sample.numberOfFrames;
    return sample;
  };
}
