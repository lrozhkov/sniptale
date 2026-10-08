import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type InputAudioTrack,
  type VideoSample,
} from 'mediabunny';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import type { PresentationCandidate } from '../../features/video/review/presentation-sequence';
import { createReviewDecodedSampleSink } from './decoded-video-sample';
import { drawReviewPresentationFrame } from './presentation-frame';

type Slot = Exclude<QuickEditPresentationSettings['intro'], { mode: 'none' }>;
type Mapping = Exclude<PresentationCandidate['mapping'], { kind: 'main' }>;
type Size = { width: number; height: number };
type Failure = 'asset-missing' | 'metadata' | 'decode' | 'mapping' | 'busy' | 'disposed';

/** Fixed media failures contain no asset identity or decoder exception text. */
class PresentationMediaError extends Error {
  constructor(public readonly code: Failure) {
    super(`presentation-media:${code}`);
    this.name = 'PresentationMediaError';
  }
}

/** One caller-owned drawing lease. Release before requesting the next frame. */
interface PresentationMediaFrame {
  draw(context: CanvasRenderingContext2D): void;
  release(): void;
}

function validateImage(bitmap: ImageBitmap, image: Extract<Slot, { mode: 'image' }>['image']) {
  if (
    bitmap.width !== image.width ||
    bitmap.height !== image.height ||
    bitmap.width > 4096 ||
    bitmap.height > 4096 ||
    bitmap.width * bitmap.height > 16_000_000 ||
    bitmap.width < 1 ||
    bitmap.height < 1
  )
    throw new PresentationMediaError('metadata');
}

async function admitVideo(input: Input, video: Extract<Slot, { mode: 'video' }>['video']) {
  const tracks = await input.getVideoTracks();
  const audio = await input.getAudioTracks();
  const track = tracks[0];
  if (
    !track ||
    tracks.length !== 1 ||
    audio.length > 1 ||
    !(await track.canDecode()) ||
    !(await track.getDecoderConfig())
  )
    throw new PresentationMediaError('metadata');
  const duration = await track.computeDuration();
  const resolution = await track.getTimeResolution();
  const width = await track.getDisplayWidth();
  const height = await track.getDisplayHeight();
  if (
    ![duration, resolution, width, height].every((value) => Number.isFinite(value) && value > 0) ||
    width !== video.source.width ||
    height !== video.source.height ||
    Math.abs(duration - video.source.duration) > 1 / resolution ||
    video.trim.start < 0 ||
    video.trim.end > duration ||
    video.trim.end <= video.trim.start
  )
    throw new PresentationMediaError('metadata');
  return { track, audio, resolution };
}

/** Owns only bookend pixels; the audio track is borrowed until dispose or cancellation. */
export async function createReviewPresentationMedia(args: {
  slot: Slot;
  readAsset(assetId: string): Promise<Blob | null>;
  signal: AbortSignal;
  output: Size;
}) {
  const { slot, signal, output } = args;
  const asset = slot.mode === 'image' ? slot.image : slot.video;
  let disposed = false;
  let pending = false;
  let input: Input | null = null;
  let bitmap: ImageBitmap | null = null;
  let sample: VideoSample | null = null;
  let currentLease: PresentationMediaFrame | null = null;
  let sink: ReturnType<typeof createReviewDecodedSampleSink> | null = null;
  let audioTrack: InputAudioTrack | null = null;
  let resolution = 0;
  const assertLive = () => {
    signal.throwIfAborted();
    if (disposed) throw new PresentationMediaError('disposed');
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    currentLease?.release();
    sample?.close();
    sample = null;
    bitmap?.close();
    bitmap = null;
    input?.dispose();
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    assertLive();
    if (![output.width, output.height].every((value) => Number.isFinite(value) && value > 0))
      throw new PresentationMediaError('metadata');
    const blob = await args.readAsset(asset.assetId);
    assertLive();
    if (!blob) throw new PresentationMediaError('asset-missing');
    if (slot.mode === 'image') {
      // Static intake persists raster bytes, including sanitized SVG converted to PNG.
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
        blob.size > 16 * 1024 * 1024
      )
        throw new PresentationMediaError('metadata');
      bitmap = await createImageBitmap(blob);
      assertLive();
      validateImage(bitmap, slot.image);
    } else {
      if (blob.size !== slot.video.source.size || blob.size > 512 * 1024 * 1024)
        throw new PresentationMediaError('metadata');
      input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const admitted = await admitVideo(input, slot.video);
      const { track, audio, resolution: admittedResolution } = admitted;
      resolution = admittedResolution;
      assertLive();
      sink = createReviewDecodedSampleSink(new VideoSampleSink(track), signal);
      audioTrack = audio[0] ?? null;
    }
  } catch (error) {
    // Cancellation can occur while an uncancellable bitmap decode is resolving.
    bitmap?.close();
    bitmap = null;
    dispose();
    signal.throwIfAborted();
    throw error instanceof PresentationMediaError ? error : new PresentationMediaError('decode');
  }
  return {
    audioTrack,
    dispose,
    async frame(mapping: Mapping, placement: Slot = slot): Promise<PresentationMediaFrame> {
      assertLive();
      if (pending || currentLease) throw new PresentationMediaError('busy');
      if (
        mapping.kind !== slot.mode ||
        mapping.assetId !== asset.assetId ||
        placement.mode !== slot.mode ||
        (placement.mode === 'image' ? placement.image.assetId : placement.video.assetId) !==
          asset.assetId
      )
        throw new PresentationMediaError('mapping');
      pending = true;
      try {
        if (slot.mode === 'video' && mapping.kind === 'video') {
          const { start, end } = mapping.range;
          const trim = placement.mode === 'video' ? placement.video.trim : slot.video.trim;
          if (
            ![start, end].every(Number.isFinite) ||
            start < trim.start ||
            end > trim.end ||
            trim.start < 0 ||
            trim.end > slot.video.source.duration ||
            end < start ||
            (mapping.holdLast ? start !== trim.end || end !== trim.end : start >= trim.end)
          )
            throw new PresentationMediaError('mapping');
          // Track ticks, rather than an arbitrary epsilon, define the half-open endpoint.
          const time = mapping.holdLast
            ? (Math.ceil(trim.end * resolution) - 1) / resolution
            : start;
          if (time < trim.start || time >= trim.end) throw new PresentationMediaError('mapping');
          const decoded = await sink!.getSample(time);
          if (!decoded) throw new PresentationMediaError('decode');
          sample = decoded;
          assertLive();
          if (
            !Number.isFinite(sample.timestamp) ||
            !Number.isFinite(sample.duration) ||
            sample.duration <= 0 ||
            sample.timestamp > time ||
            sample.timestamp + sample.duration <= time ||
            sample.displayWidth !== slot.video.source.width ||
            sample.displayHeight !== slot.video.source.height
          )
            throw new PresentationMediaError('metadata');
        }
        let released = false;
        const heldSample = sample;
        const source = slot.mode === 'image' ? slot.image : slot.video.source;
        const lease: PresentationMediaFrame = {
          draw(context) {
            assertLive();
            if (released) throw new PresentationMediaError('disposed');
            drawReviewPresentationFrame(
              context,
              source,
              output,
              placement.mode === 'image' ? placement.image : placement.video,
              (target, x, y, width, height) => {
                if (heldSample) heldSample.draw(target, x, y, width, height);
                else target.drawImage(bitmap!, x, y, width, height);
              }
            );
          },
          release() {
            if (released) return;
            released = true;
            heldSample?.close();
            if (sample === heldSample) sample = null;
            if (currentLease === lease) currentLease = null;
          },
        };
        currentLease = lease;
        return lease;
      } catch (error) {
        sample?.close();
        sample = null;
        if (!(error instanceof PresentationMediaError) || error.code !== 'mapping') dispose();
        signal.throwIfAborted();
        throw error instanceof PresentationMediaError
          ? error
          : new PresentationMediaError('decode');
      } finally {
        pending = false;
      }
    },
  };
}
