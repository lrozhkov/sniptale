import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { getProjectAsset } from '../../../composition/persistence/projects/index';
import { getRecording } from '../../../composition/persistence/recordings/index';
import type { VideoProject } from '../../../features/video/project/types';
import type { AutoProcessingAudio } from './auto-transform.candidates';
import { mergeTimeRanges, type TimeRange } from './time-ranges';

/** Analyze source PCM, not display-normalized waveform peaks. Missing decoded time is not silence. */
export async function analyzeAutoProcessingAudio(
  asset: VideoProject['assets'][number]
): Promise<AutoProcessingAudio> {
  if (asset.metadata.hasAudio === false) return { status: 'absent' };
  let input: Input | undefined;
  try {
    const source = asset.source;
    const entry =
      source.kind === 'recording'
        ? await getRecording(source.recordingId)
        : source.kind === 'project-asset'
          ? await getProjectAsset(source.projectAssetId)
          : null;
    const blob =
      entry && 'file' in entry
        ? entry.file
        : entry && 'status' in entry && entry.status === 'ready'
          ? entry.entry.file
          : null;
    if (!blob) return { status: 'unavailable' };
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const tracks = await input.getAudioTracks();
    if (!tracks.length) return { status: 'absent' };
    const trackRanges: TimeRange[][] = [];
    for (const track of tracks) {
      if (!(await track.canDecode())) return { status: 'unavailable' };
      const ranges: TimeRange[] = [];
      for await (const sample of new AudioSampleSink(track).samples()) {
        try {
          const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
            const pcm = new Float32Array(sample.numberOfFrames);
            sample.copyTo(pcm, { planeIndex, format: 'f32-planar' });
            return pcm;
          });
          const window = Math.max(1, Math.round(sample.sampleRate * 0.02));
          for (let offset = 0; offset < sample.numberOfFrames; offset += window) {
            const end = Math.min(offset + window, sample.numberOfFrames);
            if (channels.every((pcm) => isSilentPcm(pcm.subarray(offset, end))))
              ranges.push({
                startTime: sample.timestamp + offset / sample.sampleRate,
                endTime: sample.timestamp + end / sample.sampleRate,
              });
          }
        } finally {
          sample.close();
        }
      }
      trackRanges.push(mergeTimeRanges(ranges, 0.00001));
    }
    const ranges = trackRanges.reduce((a, b) =>
      a.flatMap((left) =>
        b.flatMap((right) => {
          const startTime = Math.max(left.startTime, right.startTime);
          const endTime = Math.min(left.endTime, right.endTime);
          return endTime > startTime ? [{ startTime, endTime }] : [];
        })
      )
    );
    return { status: 'analyzed', ranges };
  } catch {
    return { status: 'unavailable' };
  } finally {
    input?.dispose();
  }
}
/** Conservative -42 dB RMS threshold plus transient protection across every decoded channel. */
export function isSilentPcm(pcm: Float32Array): boolean {
  if (!pcm.length) return false;
  let sum = 0;
  for (const value of pcm) {
    if (!Number.isFinite(value) || Math.abs(value) > 0.025) return false;
    sum += value * value;
  }
  return Math.sqrt(sum / pcm.length) <= 10 ** (-42 / 20);
}
