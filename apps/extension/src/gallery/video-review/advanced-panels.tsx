import type { ReactNode } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditBackgroundPatch } from '../../features/video/review/advanced/background';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { resolveQuickEditZoomLink } from '../../features/video/review/advanced/zoom';
import type { useReviewZoomEditor } from './zoom-editor';
import { ReviewBackgroundInspector } from './background-inspector';
import { ReviewZoomInspector, ReviewZoomLinkInspector } from './zoom-inspector';

type ReviewAdvancedPanelsProps = {
  onImportImage?(file: File): void;
  advanced: QuickEditAdvancedState;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  /** Optional framing preview mounted inside the selected region inspector. */
  zoomPreview?(region: QuickEditZoomRegion): ReactNode;
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

/** Advanced-mode inspector panels: the canvas background, a zoom region, or a zoom link. */
export function ReviewAdvancedPanels(args: ReviewAdvancedPanelsProps) {
  if (args.advanced.ui.mode !== 'advanced') return null;
  const zoomRegion = args.zoom.selected(args.advanced.zoom);
  const link =
    args.zoom.linkSelection === null
      ? null
      : resolveQuickEditZoomLink(args.advanced.zoom.regions, args.zoom.linkSelection);
  return (
    <>
      {link ? (
        <ReviewZoomLinkInspector
          link={link}
          onChange={applyZoomRegionPatch.bind(null, args, link.source.id)}
          onRemove={() => {
            applyZoomRegionPatch(args, link.source.id, { linkTo: null });
            args.zoom.setLinkSelection(null);
          }}
        />
      ) : zoomRegion ? (
        <ReviewZoomInspector
          region={zoomRegion}
          preview={args.zoomPreview?.(zoomRegion)}
          onChange={applyZoomRegionPatch.bind(null, args, zoomRegion.id)}
          onReset={resetZoomRegion.bind(null, args, zoomRegion.id)}
          onDelete={removeZoomRegion.bind(null, args, zoomRegion.id)}
        />
      ) : (
        <ReviewBackgroundInspector
          onImportImage={args.onImportImage}
          background={args.advanced.background}
          onChange={applyBackgroundPatch.bind(null, args)}
        />
      )}
    </>
  );
}
