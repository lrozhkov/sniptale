import { createPresentationGpu } from './presentation-gpu';
import { resolveMediaFitFrame } from '../../features/video/project/window-geometry';
import type { GpuPreviewLayer } from '../../features/video/composition/canvas/gpu-preview';
import { drawCompositionColorOverlay } from '../../features/video/composition/canvas/scene-edges';
import { createCompositionJoinEndpoints } from '../../features/video/composition/canvas/join-endpoints';
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
  renderer?: import('../../features/video/preview/preferences').VideoPreviewRenderer;
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
  // Child canvases can remain borrowed after their render completes, until the outer GPU fence.
  private readonly children = new AbortController();
  private readonly owned: { dispose(): void }[] = [];
  private readonly resources;
  private readonly holdTime: number;
  private main: Main | null = null;
  private readonly media: Partial<Record<'intro' | 'outro', Media>> = {};
  private watermark: Watermark | null = null;
  private front: RenderCanvasLease | null = null;
  private readonly joinEndpoints;
  private disposed = false;
  private busy = false;
  private readonly gpu;

  constructor(
    private readonly args: ReviewPresentationRendererInput,
    private readonly plan: PresentationSequencePlan
  ) {
    this.gpu = args.renderer === 'gpu' ? createPresentationGpu() : null;
    const { backing } = args.main.dimensions;
    this.resources = createPreviewRenderResources({
      maximumCanvases: plan.joins?.length ? 4 : 1,
      maximumManagedBytes: backing.width * backing.height * (plan.joins?.length ? 16 : 4),
    });
    this.joinEndpoints = createCompositionJoinEndpoints({
      resources: this.resources,
      size: backing,
      renderSample: (tick) => this.sampleEndpoint(tick),
      compose: async ({ context, outgoing, incoming, incomingWeight, signal }) =>
        (await this.gpu?.render({
          output: backing,
          context,
          signal,
          prepare: () => ({
            layers: [
              { ...this.layer(outgoing), opacity: 1 - incomingWeight },
              { ...this.layer(incoming), opacity: incomingWeight, blend: 'add' },
            ],
            release() {},
          }),
        })) ?? false,
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
    const signal = this.children.signal;
    this.main = this.adopt(
      await createReviewPresentationMain({
        ...this.args.main,
        renderer: this.args.renderer ?? 'legacy',
        signal,
      })
    );
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
      if (join?.type !== 'dissolve') this.joinEndpoints.clear();
      if (selected?.join.type === 'dissolve')
        output = await this.dissolve(selected.join, selected.blend.incoming);
      else {
        output = await this.renderContent(candidate);
      }
      this.assertLive();
      const colors = [
        ...(selected && selected.join.type !== 'dissolve'
          ? [{ opacity: selected.blend.black, color: selected.join.color ?? '#000000' }]
          : []),
        {
          opacity: presentationColorOpacity(this.plan, candidate.timestampUs),
          color: presentationColor(this.plan, candidate.timestampUs),
        },
      ].filter((color) => color.opacity > 0);
      if (colors.length) {
        const content = output;
        const rendered = await this.gpu?.render({
          output: this.args.main.dimensions.backing,
          context: content.context,
          signal: this.controller.signal,
          prepare: (primitives) => ({
            layers: [
              this.layer(content.canvas),
              ...colors.map((color) => primitives.color(color.color, color.opacity)),
            ],
            release() {},
          }),
        });
        this.assertLive();
        if (!rendered)
          for (const color of colors) this.drawColor(content.context, color.opacity, color.color);
      }
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
      if (this.disposed) this.retire();
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
      const target = output;
      const slot = this.args.settings[candidate.segment];
      if (slot.mode === 'none') throw new Error('Missing bookend placement');
      const framing = slot.mode === 'image' ? slot.image : slot.video;
      const source = slot.mode === 'image' ? slot.image : slot.video.source;
      const fit = resolveMediaFitFrame({
        source,
        output: this.args.main.dimensions.backing,
        fit: framing.fit,
        crop: framing.crop,
      });
      const rendered = await this.gpu?.render({
        output: this.args.main.dimensions.backing,
        context: target.context,
        signal: this.controller.signal,
        prepare: (primitives) => {
          const bitmap = frame.snapshot();
          try {
            return {
              layers: [
                primitives.color(framing.fillColor, 1),
                {
                  ...this.layer(bitmap),
                  rect: { x: fit.x, y: fit.y, width: fit.width, height: fit.height },
                },
                ...(this.watermark
                  ? [primitives.raster((context) => this.drawWatermark(context))]
                  : []),
              ],
              release: () => bitmap.close(),
            };
          } catch (error) {
            bitmap.close();
            throw error;
          }
        },
      });
      this.assertLive();
      if (!rendered) {
        frame.draw(target.context);
        this.drawWatermark(target.context);
      }
      return output;
    } catch (error) {
      output?.release();
      throw error;
    } finally {
      frame.release();
    }
  }

  private async sampleEndpoint(tick: number): Promise<RenderCanvasLease> {
    const candidate = iteratePresentationCandidates(this.plan, {
      startTick: tick,
      endTick: tick + 1,
    })
      [Symbol.iterator]()
      .next();
    if (candidate.done) throw new Error('Missing presentation transition endpoint');
    return this.renderContent(candidate.value);
  }

  private async dissolve(join: PresentationJoin, incoming: number): Promise<RenderCanvasLease> {
    this.assertLive();
    const output = this.resources.canvas('presentation-join', this.args.main.dimensions.backing);
    try {
      await this.joinEndpoints.draw(
        output.context,
        {
          key: join,
          outgoingTime: join.outgoingTick,
          incomingTime: join.incomingTick,
          incomingWeight: incoming,
        },
        this.controller.signal
      );
      this.assertLive();
      return output;
    } catch (error) {
      output.release();
      throw error;
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

  private layer(source: GpuPreviewLayer['source']): GpuPreviewLayer {
    return {
      source,
      rect: { x: 0, y: 0, ...this.args.main.dimensions.backing },
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
  }

  private drawColor(context: CanvasRenderingContext2D, alpha: number, color: string) {
    const { backing } = this.args.main.dimensions;
    drawCompositionColorOverlay(context, alpha, color, {
      x: 0,
      y: 0,
      width: backing.width,
      height: backing.height,
    });
  }

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.args.main.signal.removeEventListener('abort', this.dispose);
    this.controller.abort();
    if (!this.busy) this.retire();
  };

  private retire() {
    this.children.abort();
    this.gpu?.dispose();
    this.front?.release();
    this.front = null;
    this.joinEndpoints.dispose();
    for (const owner of this.owned.splice(0).reverse()) owner.dispose();
    this.resources.dispose();
  }
}
