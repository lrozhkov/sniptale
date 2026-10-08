import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { planPresentationPreview } from '../../features/video/review/presentation-preview';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { buildReviewExportClipPlan } from './export-lifecycle';
import { writeReviewPresentationFrames } from './render-presentation-export';
import { resolveReviewOutputProfile } from './render-settings';

type RenderArgs = Parameters<typeof writeReviewPresentationFrames>[0];
export type PresentationPreviewInput = Omit<
  RenderArgs,
  | 'writer'
  | 'signal'
  | 'exportAudio'
  | 'provenance'
  | 'frameProbe'
  | 'onProgress'
  | 'onTimeEstimate'
>;

/** Plans disposable windows from the same full sequence and output lattice as export. */
export function preparePresentationPreview(
  input: PresentationPreviewInput,
  edge: 'intro' | 'outro',
  preferences: QuickPreviewPreferences
) {
  const settings = resolveQuickEditEffectiveState(input.advanced).presentation;
  if (!settings) throw new Error('Presentation preview is not active');
  const profile = resolveReviewOutputProfile(input.index, input.advanced, input.renderSettings);
  const mainDuration = buildReviewTimeMap(input.index.duration, input.edits).at(-1)?.resultEnd ?? 0;
  const sequence = planReviewPresentationSequence({
    settings,
    mainDuration,
    includeBookends: true,
    fragmentOffset: input.fragmentOffset,
    rate: profile.rate,
  });
  if (!sequence.ok) throw new Error('Presentation preview cannot be represented');
  return {
    sequence: sequence.plan,
    ...planPresentationPreview({
      sequence: sequence.plan,
      edge: edge === 'intro' ? 'beginning' : 'ending',
      width: profile.width,
      height: profile.height,
      preferences,
    }),
  };
}

/** Positioned, unpublished output; a hard cap is checked before allocating or reading a chunk. */
export function createPresentationPreviewBuffer(signal: AbortSignal) {
  const limit = 64 * 1024 * 1024;
  let bytes = new Uint8Array(0);
  let length = 0;
  return {
    async writeAt(position: number, chunk: Blob) {
      signal.throwIfAborted();
      const end = position + chunk.size;
      if (
        !Number.isSafeInteger(position) ||
        position < 0 ||
        !Number.isSafeInteger(end) ||
        end > limit
      )
        throw new RangeError('Presentation preview exceeds its output budget');
      if (bytes.length < end) {
        const replacement = new Uint8Array(Math.min(limit, Math.max(end, bytes.length * 2, 65536)));
        replacement.set(bytes);
        bytes = replacement;
      }
      const data = await chunk.arrayBuffer();
      signal.throwIfAborted();
      bytes.set(new Uint8Array(data), position);
      length = Math.max(length, end);
    },
    finish(type: string) {
      signal.throwIfAborted();
      return new Blob([bytes.slice(0, length)], { type });
    },
    dispose() {
      bytes = new Uint8Array(0);
      length = 0;
    },
  };
}

/** Encodes one unpublished clip; the caller owns cancellation and the returned Blob URL. */
export async function renderPresentationPreview(
  input: PresentationPreviewInput,
  plan: ReturnType<typeof preparePresentationPreview>,
  selected: 'start' | 'join' | 'end',
  signal: AbortSignal,
  deps = { write: writeReviewPresentationFrames, audio: buildReviewExportClipPlan }
) {
  const window = plan.windows.find((value) => value.name === selected);
  if (!window) throw new Error('Missing presentation preview window');
  signal.throwIfAborted();
  const writer = createPresentationPreviewBuffer(signal);
  let exportAudio: Awaited<ReturnType<typeof buildReviewExportClipPlan>> | undefined;
  try {
    const main = plan.sequence.segments.find((segment) => segment.name === 'main')!;
    const start = Math.max(window.audioStart, main.audioStart);
    const end = Math.min(
      window.audioEnd,
      main.audioStart + Math.round(main.contentDuration * 48000)
    );
    exportAudio = await deps.audio({
      advanced: input.advanced,
      fragmentOffset: input.fragmentOffset,
      signal,
      readProjectAsset: input.readProjectAsset,
      window:
        end > start
          ? { start: (start - main.audioStart) / 48000, end: (end - main.audioStart) / 48000 }
          : null,
    });
    signal.throwIfAborted();
    await deps.write(
      { ...input, writer, signal, exportAudio },
      { window, backing: { width: plan.width, height: plan.height } }
    );
    const profile = resolveReviewOutputProfile(input.index, input.advanced, input.renderSettings);
    return writer.finish(profile.format === 'webm' ? 'video/webm' : 'video/mp4');
  } finally {
    exportAudio?.dispose?.();
    writer.dispose();
  }
}
