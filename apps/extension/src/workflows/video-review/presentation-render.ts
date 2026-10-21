import { evaluateCompositionJoin } from '../../features/video/project/scene/composition-join';
import { reviewWatermarkAssets } from './asset-bytes';
import type { InputAudioTrack } from 'mediabunny';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import {
  iteratePresentationCandidates,
  planReviewPresentationSequence,
  presentationColorOpacity,
  presentationColor,
  presentationMainHoldTime,
  type PresentationCandidate,
  type PresentationJoin,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { RenderCanvasLease } from '../../features/video/composition/canvas/render-resources';
import {
  createReviewPresentationMain,
  type ReviewPresentationMainInput,
} from './presentation-main';
import { createReviewPresentationMedia } from './presentation-media';
import { createWatermarkRenderer } from '../../features/video/composition/canvas/watermark';
import { createPreviewRenderResources } from './preview-render-resources';

type Main = Awaited<ReturnType<typeof createReviewPresentationMain>>;
type Media = Awaited<ReturnType<typeof createReviewPresentationMedia>>;
type Watermark = Awaited<ReturnType<typeof createWatermarkRenderer>>;

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
    includeBookends: args.plan.includeBookends,
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
  private endpoints: {
    join: PresentationJoin;
    outgoing: RenderCanvasLease;
    incoming: RenderCanvasLease;
  } | null = null;
  private disposed = false;
  private busy = false;

  constructor(
    private readonly args: ReviewPresentationRendererInput,
    private readonly plan: PresentationSequencePlan
  ) {
    const { backing } = args.main.dimensions;
    this.resources = createPreviewRenderResources({
      maximumCanvases: plan.joins?.length ? 4 : 1,
      maximumManagedBytes: backing.width * backing.height * (plan.joins?.length ? 16 : 4),
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
        await createWatermarkRenderer(
          this.args.main.effective.watermark,
          this.args.main.dimensions.canonical,
          reviewWatermarkAssets(this.args.main.readAsset),
          signal
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
      const selected = this.joinAt(candidate.timestampUs);
      const join = selected?.join;
      if (this.endpoints?.join !== join) this.releaseEndpoints();
      if (selected?.join.type === 'dissolve')
        output = await this.dissolve(selected.join, selected.blend.incoming);
      else {
        output = await this.renderContent(candidate);
        if (selected) this.drawColor(output.context, selected.blend.black, selected.join.color);
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

  private joinAt(timeUs: number) {
    for (const join of this.plan.joins ?? []) {
      const blend = evaluateCompositionJoin(timeUs, join.seamUs, join.beforeUs, join.afterUs);
      if (blend) return { join, blend };
    }
    return null;
  }

  private async renderContent(candidate: PresentationCandidate): Promise<RenderCanvasLease> {
    if (candidate.segment === 'main')
      return this.main!.render(candidate, { heldMainLocalTime: this.holdTime });
    if (candidate.mapping.kind === 'main') throw new Error('Invalid bookend mapping');
    const frame = await this.media[candidate.segment]!.frame(candidate.mapping);
    let output: RenderCanvasLease | undefined;
    try {
      this.assertLive();
      output = this.resources.canvas('presentation-bookend', this.args.main.dimensions.backing);
      frame.draw(output.context);
      this.drawWatermark(output.context);
      return output;
    } catch (error) {
      output?.release();
      throw error;
    } finally {
      frame.release();
    }
  }

  private async endpoint(tick: number, name: string): Promise<RenderCanvasLease> {
    const candidate = iteratePresentationCandidates(this.plan, {
      startTick: tick,
      endTick: tick + 1,
    })
      [Symbol.iterator]()
      .next();
    if (candidate.done) throw new Error('Missing presentation transition endpoint');
    const content = await this.renderContent(candidate.value);
    let copy: RenderCanvasLease | undefined;
    try {
      this.assertLive();
      copy = this.resources.canvas(name, this.args.main.dimensions.backing);
      copy.context.drawImage(content.canvas, 0, 0);
      return copy;
    } catch (error) {
      copy?.release();
      throw error;
    } finally {
      content.release();
    }
  }

  private async dissolve(join: PresentationJoin, incoming: number): Promise<RenderCanvasLease> {
    if (!this.endpoints) {
      const outgoing = await this.endpoint(join.outgoingTick, 'presentation-join-outgoing');
      try {
        const incoming = await this.endpoint(join.incomingTick, 'presentation-join-incoming');
        this.endpoints = { join, outgoing, incoming };
      } catch (error) {
        outgoing.release();
        throw error;
      }
    }
    this.assertLive();
    const output = this.resources.canvas('presentation-join', this.args.main.dimensions.backing);
    try {
      const context = output.context;
      context.save();
      try {
        context.globalAlpha = 1 - incoming;
        context.drawImage(this.endpoints.outgoing.canvas, 0, 0);
        // Add premultiplied contributions so transparent corners also dissolve away.
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = incoming;
        context.drawImage(this.endpoints.incoming.canvas, 0, 0);
      } finally {
        context.restore();
      }
      return output;
    } catch (error) {
      output.release();
      throw error;
    }
  }

  private releaseEndpoints() {
    this.endpoints?.outgoing.release();
    this.endpoints?.incoming.release();
    this.endpoints = null;
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
    this.drawColor(
      context,
      presentationColorOpacity(this.plan, timestampUs),
      presentationColor(this.plan, timestampUs)
    );
  }

  private drawColor(context: CanvasRenderingContext2D, alpha: number, color: string) {
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
      context.fillStyle = color;
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
    this.releaseEndpoints();
    for (const owner of this.owned.splice(0).reverse()) owner.dispose();
    this.resources.dispose();
  };
}
