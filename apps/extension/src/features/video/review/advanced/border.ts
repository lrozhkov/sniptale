import { sampleSceneBorder, type SceneBorderFrame } from '../../composition/scene-border';
import { fitQuickEditZoomTransitions } from './zoom';
import type { QuickEditRect } from './scene';
import type { QuickEditZoomRegion } from './types';

/** Timeline-only source clock; cuts skip phases and speed changes follow footage. */
export function evaluateQuickEditBordersAtTime(args: {
  regions: readonly QuickEditZoomRegion[];
  time: number;
  output: { width: number; height: number };
  video: QuickEditRect;
  scale: number;
}): SceneBorderFrame[] {
  return args.regions
    .filter(
      (region) =>
        !region.dormant && region.border && args.time >= region.start && args.time < region.end
    )
    .toSorted(
      (a, b) =>
        (a.sourceAnchor?.start ?? a.start) - (b.sourceAnchor?.start ?? b.start) ||
        a.id.localeCompare(b.id)
    )
    .flatMap((region) => {
      const clock = region.borderClock;
      const fitted = fitQuickEditZoomTransitions(region);
      return sampleSceneBorder({
        id: region.id,
        border: region.border!,
        clock: {
          time: clock
            ? clock.offset + (args.time - region.start) * clock.rate
            : args.time - region.start,
          duration: clock?.duration ?? region.end - region.start,
          enter: clock?.enter ?? fitted.enter,
          exit: clock?.exit ?? fitted.exit,
        },
        window: args.video,
        scale: args.scale,
      });
    });
}
