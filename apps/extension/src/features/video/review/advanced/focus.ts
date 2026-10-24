import {
  resolveSceneSpotlightTarget,
  sampleSceneSpotlight,
  type SceneSpotlightFrame,
} from '../../composition/scene-spotlight';
import { placeQuickEditLens } from '../../project/scene/focus-appearance';
import { evaluateReviewCursorFocus } from './cursor-focus-path';
import { resolveQuickEditFocusLink } from './focus-layout';
import { sampleQuickEditFocusAtTime, type QuickEditRect } from './scene';
import type { QuickEditZoomRegion } from './types';

/** Samples Gallery source clocks and links before evaluating shared opening geometry. */
export function evaluateQuickEditSpotlightAtTime(args: {
  regions: readonly QuickEditZoomRegion[];
  time: number;
  output: { width: number; height: number };
  video: QuickEditRect;
  scale: number;
}): SceneSpotlightFrame | null {
  const sample = sampleQuickEditFocusAtTime(
    args.regions.filter((region) => region.spotlight),
    args.time,
    args.regions
  );
  if (!sample?.to.spotlight) return null;
  return sampleSceneSpotlight({
    spotlight: reviewLensAtTime(sample.to, args.time),
    window: args.video,
    extent: { x: 0, y: 0, ...args.output },
    scale: args.scale,
    progress: sample.progress,
    phase: sample.phase === 'exit' ? 'exit' : 'enter',
    ...(sample.from?.spotlight
      ? {
          from: resolveSceneSpotlightTarget(
            reviewLensAtTime(sample.from, args.time),
            args.video,
            args.scale
          ),
        }
      : {}),
  });
}

/** All independent masks, with final protection holes and linked morph presence. */
export function evaluateQuickEditSpotlightsAtTime(
  args: Parameters<typeof evaluateQuickEditSpotlightAtTime>[0]
): SceneSpotlightFrame[] {
  const regions = args.regions.filter((region) => !region.dormant && region.spotlight);
  const frames: SceneSpotlightFrame[] = [];
  for (const region of regions) {
    const link = resolveQuickEditFocusLink(args.regions, region.id);
    if (link && args.time >= region.end && args.time < link.target.start) {
      const frame = evaluateQuickEditSpotlightAtTime({ ...args, regions: [region, link.target] });
      if (frame)
        frames.push({
          ...frame,
          protectionOpening: frame.opening,
          protectionRadius: frame.radius,
          presence: 1,
          openingClipProgress: 1,
        });
      continue;
    }
    if (args.time < region.start || args.time >= region.end) continue;
    const incoming = regions.find(
      (item) => resolveQuickEditFocusLink(args.regions, item.id)?.target.id === region.id
    );
    const connected = [...(incoming ? [incoming] : []), region, ...(link ? [link.target] : [])];
    const sample = sampleQuickEditFocusAtTime(connected, args.time);
    const frame = evaluateQuickEditSpotlightAtTime({ ...args, regions: connected });
    if (!frame || !sample) continue;
    const target = resolveSceneSpotlightTarget(
      reviewLensAtTime(region, args.time),
      args.video,
      args.scale
    );
    const reveal =
      sample.phase === 'exit' ? region.spotlight!.exitReveal : region.spotlight!.reveal;
    frames.push({
      ...frame,
      protectionOpening: target.opening,
      protectionRadius: target.radius,
      presence: sample.progress,
      openingClipProgress: reveal === 'contract' ? sample.progress : 1,
    });
  }
  return frames;
}

function reviewLensAtTime(region: QuickEditZoomRegion, time: number) {
  const spotlight = region.spotlight!;
  const context = region.cursorFocus;
  if (
    spotlight.effect !== 'magnify' ||
    !(region.followCursor ?? context?.path.mode === 'follow') ||
    !context
  )
    return spotlight;
  const run = context.timeMap?.find(
    (part) => part.kind !== 'cut' && time >= part.resultStart && time < part.resultEnd
  );
  if (context.timeMap && !run) return spotlight;
  const sourceTime = run ? run.sourceStart + (time - run.resultStart) * run.rate : time;
  return placeQuickEditLens(spotlight, evaluateReviewCursorFocus(context.path, sourceTime));
}
