import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { QuickEditBackgroundPatch } from '../../features/video/review/advanced/background';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import type { useReviewZoomEditor } from './zoom-editor';
import { ReviewBackgroundInspector } from './background-inspector';
import { ReviewZoomInspector } from './zoom-inspector';

type ReviewAdvancedPanelsProps = {
  advanced: QuickEditAdvancedState;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  setBackground(
    update: (
      background: QuickEditAdvancedState['background']
    ) => QuickEditAdvancedState['background']
  ): void;
};

function applyBackgroundPatch(
  args: ReviewAdvancedPanelsProps,
  patch: QuickEditBackgroundPatch
): void {
  args.setBackground((background) => updateQuickEditBackground(background, patch));
}

function applyZoomRegionPatch(
  args: ReviewAdvancedPanelsProps,
  regionId: string,
  patch: QuickEditZoomRegionPatch
): void {
  args.zoom.change(regionId, patch);
}

function resetZoomRegion(args: ReviewAdvancedPanelsProps, regionId: string): void {
  args.zoom.resetPosition(regionId);
}

function removeZoomRegion(args: ReviewAdvancedPanelsProps, regionId: string): void {
  args.zoom.remove(regionId);
}

/** Advanced-mode inspector panels: the canvas background and the selected zoom region. */
export function ReviewAdvancedPanels(args: ReviewAdvancedPanelsProps) {
  if (args.advanced.ui.mode !== 'advanced') return null;
  const zoomRegion = args.zoom.selected(args.advanced.zoom);
  return (
    <>
      <ReviewBackgroundInspector
        background={args.advanced.background}
        onChange={applyBackgroundPatch.bind(null, args)}
      />
      {zoomRegion ? (
        <ReviewZoomInspector
          region={zoomRegion}
          onChange={applyZoomRegionPatch.bind(null, args, zoomRegion.id)}
          onReset={resetZoomRegion.bind(null, args, zoomRegion.id)}
          onDelete={removeZoomRegion.bind(null, args, zoomRegion.id)}
        />
      ) : null}
    </>
  );
}
