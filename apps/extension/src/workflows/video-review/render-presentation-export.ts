import type { AudioSample, Output } from 'mediabunny';
import type { ReviewFrameExportInput } from './render-export-input';
import type { ReviewPacketReceipt } from './packet-export';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { planReviewCutTransitions } from '../../features/video/review/cuts';
import {
  planReviewPresentationSequence,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import {
  createPresentationReviewProvenance,
  encodeReviewProvenance,
  parseReviewProvenance,
} from '../../features/video/review/provenance';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import {
  createExportTimeEstimator,
  planExportTimeWork,
} from '../../features/video/project/export/time-estimate';
import {
  resolveReviewOutputProfile,
  resolveReviewVideoEncoderConfig,
  reviewOutputCodecs,
} from './render-settings';
import { supportedReviewVideoCodecs } from './media-index';
import { createReviewPresentationRenderer } from './presentation-render';
import { renderPresentationVideo, presentationPreviewFrames } from './presentation-video';
import {
  probePresentationAudio,
  renderPresentationAudio,
  type PresentationAudioInput,
} from './presentation-audio';
import { createPresentationAudioEncoder } from './processed-audio-encoder';
import { createReviewMediaOutput } from './media-output';
import { planReviewExportTime } from './time-estimate-plan';
import { QuickEditExportUnavailable } from './export-unavailable';

interface PresentationExportPreview {
  window: import('../../features/video/review/presentation-preview').PresentationPreviewWindow;
  backing: { width: number; height: number };
}

type Args = ReviewFrameExportInput;
type Renderer = Awaited<ReturnType<typeof createReviewPresentationRenderer>>;
type Encoder = ReturnType<typeof createPresentationAudioEncoder>;
type Preparation = Awaited<ReturnType<typeof prepare>>;

async function prepare(args: Args, preview?: PresentationExportPreview) {
  args.signal.throwIfAborted();
  const effective = resolveQuickEditEffectiveState(args.advanced);
  if (!effective.presentation) throw new Error('Presentation export is not active');
  const profile = resolveReviewOutputProfile(args.index, args.advanced, args.renderSettings);
  if (!profile.dimensionsSupported) throw new QuickEditExportUnavailable(['canvas-size']);
  const codec = profile.codec;
  if (!codec || !reviewOutputCodecs(args.index, profile.format).includes(codec))
    throw new QuickEditExportUnavailable(['video-encoder']);
  const segments = buildReviewTimeMap(args.index.duration, args.edits);
  const mainDuration = segments.at(-1)?.resultEnd ?? 0;
  const result = planReviewPresentationSequence({
    settings: effective.presentation,
    mainDuration,
    fragmentOffset: args.fragmentOffset,
    includeBookends: args.includeBookends ?? true,
    rate: profile.rate,
  });
  if (!result.ok) throw new Error('Presentation cannot be represented on the output frame lattice');
  if (preview) {
    if (args.frameProbe) throw new Error('A preview window cannot also be a sparse frame probe');
    presentationPreviewFrames(result.plan, preview.window);
  }
  if (
    preview &&
    (![preview.backing.width, preview.backing.height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 640
    ) ||
      preview.window.audioStart !== Math.round((preview.window.startUs * 48_000) / 1_000_000) ||
      preview.window.audioEnd !== Math.round((preview.window.endUs * 48_000) / 1_000_000))
  )
    throw new Error('Invalid presentation preview geometry or audio window');
  const outputProfile = preview
    ? {
        ...profile,
        width: preview.backing.width,
        height: preview.backing.height,
        fps: Math.min(profile.fps, 30),
      }
    : profile;
  const supported = await supportedReviewVideoCodecs(profile.format, {
    width: outputProfile.width,
    height: outputProfile.height,
    fps: outputProfile.fps,
    bitrate: profile.bitrate,
  });
  args.signal.throwIfAborted();
  if (!supported.includes(codec)) throw new QuickEditExportUnavailable(['video-encoder']);
  const canonical = computeQuickEditSceneSize({
    source: { width: args.index.width ?? 1920, height: args.index.height ?? 1080 },
    canvas: effective.canvas,
    background: effective.background,
    windowHeader: effective.windowHeader,
  });
  return {
    effective,
    settings: effective.presentation,
    profile: outputProfile,
    codec,
    segments,
    plan: result.plan,
    dimensions: {
      canonical: { width: canonical.width, height: canonical.height },
      backing: { width: outputProfile.width, height: outputProfile.height },
    },
  };
}

function audioInput(args: Args, prepared: Preparation, renderer: Renderer): PresentationAudioInput {
  const bookends: PresentationAudioInput['bookends'] = {};
  for (const name of ['intro', 'outro'] as const) {
    const slot = prepared.settings[name];
    if (slot.mode === 'video')
      bookends[name] = {
        track: renderer.audioTracks[name],
        muted: slot.video.audio.muted,
        gain: slot.video.audio.gain,
      };
  }
  return {
    plan: prepared.plan,
    main: {
      track: renderer.audioTracks.main,
      segments: prepared.segments,
      isOriginalMuted: (segment) =>
        args.edits.some(
          (edit) =>
            edit.kind === 'speed' &&
            edit.start <= segment.sourceStart &&
            edit.end >= segment.sourceEnd &&
            edit.audio === 'mute'
        ),
      ...(args.exportAudio ? { exportAudio: args.exportAudio } : {}),
    },
    bookends,
    signal: args.signal,
  };
}

function provenance(args: Args, prepared: Preparation, audioReencoded: boolean) {
  if (!args.provenance) return undefined;
  const base = parseReviewProvenance(args.provenance);
  if (!base || base.format !== 'sniptale.video-edit.v1')
    throw new Error('Presentation export requires valid base provenance');
  const watermark = prepared.effective.watermark;
  return encodeReviewProvenance(
    createPresentationReviewProvenance({
      base: { ...base, audioReencoded },
      plan: prepared.plan,
      output: {
        format: prepared.profile.format,
        videoCodec: prepared.codec,
        width: prepared.profile.width,
        height: prepared.profile.height,
        frameRateMode: args.renderSettings?.frameRateMode ?? 'constant',
      },
      includeBookends: args.includeBookends ?? true,
      watermarkBaked:
        !!watermark &&
        (watermark.mode === 'text'
          ? !!watermark.text.value
          : watermark.mode === 'image' && !!watermark.image),
    })
  );
}

function progress(args: Args, prepared: Preparation) {
  const duration = prepared.plan.totalDurationUs / 1_000_000;
  const main = prepared.plan.segments.find((segment) => segment.name === 'main')!;
  const mainStart = main.startUs / 1_000_000;
  const work = planReviewExportTime({
    duration: main.contentDuration,
    fragmentOffset: args.fragmentOffset,
    zoomRegions: prepared.effective.zoomRegions,
    transitions: planReviewCutTransitions(args.index.duration, args.edits),
    webcam: !!prepared.effective.webcam,
  }).map((part) => ({
    ...part,
    start: part.start + mainStart,
    end: Math.min(main.endUs / 1_000_000, part.end + mainStart),
  }));
  const estimator = createExportTimeEstimator(
    planExportTimeWork(
      0,
      duration,
      [
        ...prepared.plan.segments.flatMap((part) => [
          part.startUs / 1_000_000,
          part.endUs / 1_000_000,
        ]),
        ...work.flatMap((part) => [part.start, part.end]),
      ],
      (time) => work.find((part) => time >= part.start && time < part.end)?.cost ?? 1
    )
  );
  let lastReport = -Infinity;
  return (fraction: number) => {
    args.onProgress?.(fraction);
    const estimate = estimator.observe(fraction * duration);
    const now = performance.now();
    if (!args.frameProbe && now - lastReport >= 500) {
      lastReport = now;
      args.onTimeEstimate?.(estimate);
    }
  };
}

function audioRanges(
  plan: PresentationSequencePlan,
  segments: Preparation['segments']
): ReviewPacketReceipt['audioRanges'] {
  return plan.segments.flatMap((placement) => {
    const start = placement.startUs / 1_000_000;
    if (placement.content.kind === 'video')
      return [
        {
          sourceStart: placement.content.sourceStart,
          sourceEnd: placement.content.sourceEnd,
          resultStart: start,
          resultEnd: placement.endUs / 1_000_000,
        },
      ];
    if (placement.content.kind === 'main')
      return segments
        .filter((segment) => segment.kind !== 'cut')
        .map((segment) => ({
          sourceStart: segment.sourceStart,
          sourceEnd: segment.sourceEnd,
          resultStart: start + segment.resultStart,
          resultEnd: Math.min(placement.endUs / 1_000_000, start + segment.resultEnd),
        }));
    return [];
  });
}

/** Assemble source-clock inputs once for export, preview and sparse probes. */
function createRenderer(args: Args, prepared: Preparation) {
  return createReviewPresentationRenderer({
    plan: prepared.plan,
    settings: prepared.settings,
    main: {
      file: args.file,
      index: args.index,
      edits: args.edits,
      effective: prepared.effective,
      ...(args.comments ? { comments: args.comments } : {}),
      ...(args.clickCues ? { clickCues: args.clickCues } : {}),
      ...(args.keyCues ? { keyCues: args.keyCues } : {}),
      fragmentOffset: args.fragmentOffset,
      dimensions: prepared.dimensions,
      readAsset: args.readProjectAsset,
      signal: args.signal,
    },
  });
}

function createMux(
  args: Args,
  prepared: Preparation,
  encoder: Encoder | null,
  metadata: string | undefined
) {
  return createReviewMediaOutput({
    index: args.index,
    container: prepared.profile.format,
    processedAudio: null,
    omitAudio: !encoder,
    ...(encoder ? { presentationAudio: { source: encoder.source, window: encoder.window } } : {}),
    writer: args.writer,
    signal: args.signal,
    ...(metadata ? { provenance: metadata } : {}),
    sampleVideo: {
      codec: prepared.codec,
      fullCodecString: resolveReviewVideoEncoderConfig(prepared.codec, {
        width: prepared.profile.width,
        height: prepared.profile.height,
        fps: prepared.profile.fps,
      }).codec,
      frameRate: prepared.profile.fps,
      frameRateMode: args.renderSettings?.frameRateMode,
      preserveFrameTiming: true,
      bitrate: prepared.profile.bitrate,
      quality: args.renderSettings?.quality ?? 'HIGH',
    },
    onAudioPacket() {},
  });
}

/** Bounded PCM lead and preview timestamp rebasing; the writer owns closing the iterator. */
function createAudioDrain(
  state: { audio: AsyncGenerator<AudioSample> | null },
  encoder: Encoder | null,
  signal: AbortSignal,
  preview?: PresentationExportPreview
) {
  let audioEnd = 0;
  return async (until: number) => {
    while (state.audio && encoder && audioEnd < until) {
      signal.throwIfAborted();
      const next = await state.audio.next();
      if (next.done) {
        state.audio = null;
        break;
      }
      if (preview) {
        const clone = next.value.clone();
        try {
          clone.setTimestamp(next.value.timestamp - preview.window.audioStart / 48_000);
          await encoder.add(clone);
        } finally {
          clone.close();
        }
      } else await encoder.add(next.value);
      audioEnd =
        next.value.timestamp +
        next.value.numberOfFrames / next.value.sampleRate -
        (preview ? preview.window.audioStart / 48_000 : 0);
    }
  };
}

/** One whole-sequence render/mux lifetime; publication and the positioned writer remain caller-owned. */
export async function writeReviewPresentationFrames(
  args: Args,
  preview?: PresentationExportPreview
): Promise<ReviewPacketReceipt> {
  const prepared = await prepare(args, preview);
  const receipt: ReviewPacketReceipt = {
    videoPackets: 0,
    audioPackets: 0,
    resultDuration:
      (preview ? preview.window.endUs - preview.window.startUs : prepared.plan.totalDurationUs) /
      1_000_000,
    audioRanges: [],
    audioReencoded: false,
    outputAudioCodec: null,
    videoReencoded: true,
  };
  let renderer: Renderer | null = null;
  let encoder: Encoder | null = null;
  let output: Output | null = null;
  const audioState: { audio: AsyncGenerator<AudioSample> | null } = { audio: null };
  const disposeEncoder = () => {
    const current = encoder;
    encoder = null;
    current?.dispose();
  };
  try {
    renderer = await createRenderer(args, prepared);
    const onProgress = preview ? args.onProgress : progress(args, prepared);
    if (args.frameProbe) {
      receipt.videoPackets = await renderPresentationVideo({
        plan: prepared.plan,
        renderer,
        output: args.frameProbe,
        signal: args.signal,
        windows: videoExportSampleWindows(receipt.resultDuration, prepared.profile.fps),
        ...(onProgress ? { onProgress } : {}),
      });
      return receipt;
    }
    const audioArgs = audioInput(args, prepared, renderer);
    if (preview)
      audioArgs.window = { start: preview.window.audioStart, end: preview.window.audioEnd };
    const sound = await probePresentationAudio(audioArgs, prepared.profile.format);
    if (sound.audible && !sound.codec) throw new QuickEditExportUnavailable(['audio-encoder']);
    if (sound.codec) {
      encoder = createPresentationAudioEncoder({
        codec: sound.codec,
        frameCount: preview
          ? preview.window.audioEnd - preview.window.audioStart
          : prepared.plan.segments.at(-1)!.audioEnd,
        signal: args.signal,
        onPacket: () => {
          receipt.audioPackets++;
        },
      });
      audioState.audio = renderPresentationAudio(audioArgs);
      receipt.audioReencoded = true;
      receipt.outputAudioCodec = sound.codec;
      receipt.audioRanges = preview ? [] : audioRanges(prepared.plan, prepared.segments);
    }
    const metadata = preview ? undefined : provenance(args, prepared, !!encoder);
    const tracks = createMux(args, prepared, encoder, metadata);
    output = tracks.output;
    if (tracks.video.kind !== 'sample')
      throw new Error('Presentation video output configuration changed');
    const video = tracks.video.source;
    await output.start();
    const drainAudio = createAudioDrain(audioState, encoder, args.signal, preview);
    receipt.videoPackets = await renderPresentationVideo({
      plan: prepared.plan,
      renderer,
      signal: args.signal,
      adaptive: !preview && args.renderSettings?.frameRateMode === 'adaptive',
      ...(preview ? { window: preview.window } : {}),
      ...(onProgress ? { onProgress } : {}),
      output: {
        async add(sample) {
          // At most one <=1s PCM window leads the emitted video sample; native queues stay bounded.
          await drainAudio(sample.timestamp + sample.duration);
          args.signal.throwIfAborted();
          await video.add(sample);
        },
      },
    });
    await drainAudio(receipt.resultDuration);
    await audioState.audio?.return(undefined);
    audioState.audio = null;
    await encoder?.finish();
    video.close();
    args.signal.throwIfAborted();
    await output.finalize();
    args.signal.throwIfAborted();
    args.onProgress?.(1);
    return receipt;
  } catch (error) {
    disposeEncoder();
    await output?.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      await audioState.audio?.return(undefined);
    } finally {
      disposeEncoder();
      renderer?.dispose();
      args.onTimeEstimate?.(null);
    }
  }
}
