import type { InputAudioTrack } from 'mediabunny';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import {
  iteratePresentationCandidates,
  planReviewPresentationSequence,
  presentationColorOpacity,
  presentationMainHoldTime,
  type PresentationCandidate,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { RenderCanvasLease } from '../../features/video/composition/canvas/render-resources';
import {
  createReviewPresentationMain,
  type ReviewPresentationMainInput,
} from './presentation-main';
import { createReviewPresentationMedia } from './presentation-media';
import { createReviewWatermarkRenderer } from './render-watermark';
import { createPreviewRenderResources } from './preview-render-resources';

type Main = Awaited<ReturnType<typeof createReviewPresentationMain>>;
type Media = Awaited<ReturnType<typeof createReviewPresentationMedia>>;
type Watermark = Awaited<ReturnType<typeof createReviewWatermarkRenderer>>;

/** Frozen planner output and the matching main composition snapshot. */
export interface ReviewPresentationRendererInput {
  plan: PresentationSequencePlan;
  settings: QuickEditPresentationSettings;
  main: ReviewPresentationMainInput;
}

/** Shared full-export and sparse-seam renderer; caller releases each frame before requesting another. */
export async function createReviewPresentationRenderer(args: ReviewPresentationRendererInput) {
  const plan = matchingPlan(args);
  const owner = new PresentationRenderer(args, plan);
  try {
    await owner.open();
    return {
      render: owner.render.bind(owner),
      /** Borrowed tracks expire on renderer disposal, cancellation or terminal render failure. */
      audioTracks: owner.audioTracks,
      dispose: owner.dispose,
    };
  } catch (error) {
    owner.dispose();
    throw error;
  }
}

function matchingPlan(args: ReviewPresentationRendererInput): PresentationSequencePlan {
  args.main.signal.throwIfAborted();
  const duration =
    buildReviewTimeMap(args.main.index.duration, args.main.edits).at(-1)?.resultEnd ?? 0;
  const result = planReviewPresentationSequence({
    settings: args.settings,
    mainDuration: duration,
    fragmentOffset: args.main.fragmentOffset,
    includeBookends: args.plan.segments.some((segment) => segment.name !== 'main'),
    rate: args.plan.rate,
  });
  // Plans are the canonical DTO returned by the pure planner, never independently assembled timelines.
  if (!result.ok || JSON.stringify(result.plan) !== JSON.stringify(args.plan))
    throw new Error('Presentation plan does not match its composition snapshot');
  const { canonical, backing } = args.main.dimensions;
  if (
    ![canonical.width, canonical.height].every((value) => Number.isFinite(value) && value > 0) ||
    ![backing.width, backing.height].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    throw new Error('Invalid presentation dimensions');
  return result.plan;
}

function assertCandidate(plan: PresentationSequencePlan, candidate: PresentationCandidate) {
  const segment = plan.segments.find((entry) => entry.name === candidate.segment);
  if (
    !segment ||
    !Number.isSafeInteger(candidate.tick) ||
    candidate.tick < segment.startTick ||
    candidate.tick >= segment.endTick
  )
    throw new Error('Candidate is outside the presentation plan');
  // Restrict iteration to one tick while retaining the original segment origin and global lattice.
  const expected = iteratePresentationCandidates({
    ...plan,
    segments: [{ ...segment, startTick: candidate.tick, endTick: candidate.tick + 1 }],
  })
    [Symbol.iterator]()
    .next();
  if (expected.done || JSON.stringify(candidate) !== JSON.stringify(expected.value))
    throw new Error('Candidate does not match the presentation lattice');
}

class PresentationRenderer {
  readonly audioTracks: {
    main: InputAudioTrack | null;
    intro: InputAudioTrack | null;
    outro: InputAudioTrack | null;
  } = {
    main: null,
    intro: null,
    outro: null,
  };
  private readonly controller = new AbortController();
  private readonly owned: { dispose(): void }[] = [];
  private readonly resources;
  private readonly holdTime: number;
  private main: Main | null = null;
  private readonly media: Partial<Record<'intro' | 'outro', Media>> = {};
  private watermark: Watermark | null = null;
  private front: RenderCanvasLease | null = null;
  private disposed = false;
  private busy = false;

  constructor(
    private readonly args: ReviewPresentationRendererInput,
    private readonly plan: PresentationSequencePlan
  ) {
    const { backing } = args.main.dimensions;
    this.resources = createPreviewRenderResources({
      maximumCanvases: 1,
      maximumManagedBytes: backing.width * backing.height * 4,
    });
    this.holdTime = presentationMainHoldTime(plan);
    args.main.signal.addEventListener('abort', this.dispose, { once: true });
  }

  private assertLive() {
    this.args.main.signal.throwIfAborted();
    this.controller.signal.throwIfAborted();
    if (this.disposed) throw new Error('Presentation renderer disposed');
  }

  private adopt<T extends { dispose(): void }>(value: T): T {
    if (this.disposed) {
      value.dispose();
      this.assertLive();
    }
    this.owned.push(value);
    return value;
  }

  async open() {
    this.assertLive();
    const signal = this.controller.signal;
    this.main = this.adopt(await createReviewPresentationMain({ ...this.args.main, signal }));
    this.audioTracks.main = this.main.audioTrack;
    for (const name of ['intro', 'outro'] as const) {
      if (!this.plan.segments.some((segment) => segment.name === name)) continue;
      const slot = this.args.settings[name];
      if (slot.mode === 'none') throw new Error('Missing active presentation slot');
      const media = this.adopt(
        await createReviewPresentationMedia({
          slot,
          readAsset: this.args.main.readAsset,
          signal,
          output: this.args.main.dimensions.backing,
        })
      );
      this.media[name] = media;
      this.audioTracks[name] = media.audioTrack;
    }
    if (Object.keys(this.media).length)
      this.watermark = this.adopt(
        await createReviewWatermarkRenderer(
          this.args.main.effective.watermark,
          this.args.main.dimensions.canonical,
          signal,
          this.args.main.readAsset
        )
      );
    this.assertLive();
  }

  async render(candidate: PresentationCandidate): Promise<RenderCanvasLease> {
    this.assertLive();
    if (this.busy || this.front) throw new Error('Presentation frame is already leased');
    assertCandidate(this.plan, candidate);
    this.busy = true;
    let output: RenderCanvasLease | undefined;
    try {
      if (candidate.segment === 'main') {
        output = await this.main!.render(candidate, { heldMainLocalTime: this.holdTime });
      } else {
        if (candidate.mapping.kind === 'main') throw new Error('Invalid bookend mapping');
        const media = this.media[candidate.segment]!;
        const frame = await media.frame(candidate.mapping);
        try {
          this.assertLive();
          output = this.resources.canvas('presentation-bookend', this.args.main.dimensions.backing);
          frame.draw(output.context);
          this.drawWatermark(output.context);
        } finally {
          frame.release();
        }
      }
      this.assertLive();
      this.drawFade(output.context, candidate.timestampUs);
      const held = output;
      let released = false;
      const lease: RenderCanvasLease = {
        canvas: held.canvas,
        context: held.context,
        release: () => {
          if (released) return;
          released = true;
          held.release();
          if (this.front === lease) this.front = null;
        },
      };
      this.front = lease;
      return lease;
    } catch (error) {
      output?.release();
      this.dispose();
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private drawWatermark(context: CanvasRenderingContext2D) {
    const { canonical, backing } = this.args.main.dimensions;
    context.save();
    try {
      context.setTransform(
        backing.width / canonical.width,
        0,
        0,
        backing.height / canonical.height,
        0,
        0
      );
      this.watermark?.draw(context);
    } finally {
      context.restore();
    }
  }

  private drawFade(context: CanvasRenderingContext2D, timestampUs: number) {
    const alpha = presentationColorOpacity(this.plan, timestampUs);
    if (alpha === 0) return;
    const { backing } = this.args.main.dimensions;
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = alpha;
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = context.shadowOffsetY = 0;
      context.fillStyle = this.plan.color;
      context.fillRect(0, 0, backing.width, backing.height);
    } finally {
      context.restore();
    }
  }

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.args.main.signal.removeEventListener('abort', this.dispose);
    this.controller.abort();
    this.front?.release();
    this.front = null;
    for (const owner of this.owned.splice(0).reverse()) owner.dispose();
    this.resources.dispose();
  };
}
