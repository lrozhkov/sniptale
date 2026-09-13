import { MAX_VIDEO_PROJECT_AUDIO_PEAKS } from '../../features/video/project/types';

/** Decode long assets in bounded PCM chunks instead of allocating a whole-file AudioBuffer. */
export async function loadStreamingAudioPeaks(
  blob: Blob,
  duration: number
): Promise<number[] | null> {
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const peaks = new Array<number>(
      Math.min(MAX_VIDEO_PROJECT_AUDIO_PEAKS, Math.ceil(duration * 100))
    ).fill(0);
    let decoded = false;
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const pcm = new Float32Array(sample.numberOfFrames);
        for (let channel = 0; channel < sample.numberOfChannels; channel++) {
          sample.copyTo(pcm, { planeIndex: channel, format: 'f32-planar' });
          for (let frame = 0; frame < pcm.length; frame++) {
            const time = sample.timestamp + frame / sample.sampleRate;
            if (time < 0 || time >= duration) continue;
            const index = Math.min(peaks.length - 1, Math.floor((time / duration) * peaks.length));
            const amplitude = Math.abs(pcm[frame]!);
            if (Number.isFinite(amplitude))
              peaks[index] = Math.max(peaks[index]!, Math.min(1, amplitude));
          }
        }
        decoded = true;
      } finally {
        sample.close();
      }
    }
    return decoded ? peaks : null;
  } finally {
    input.dispose();
  }
}
