import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { resolveQuickEditZoomLink } from '../../features/video/review/advanced/zoom';
import type { useReviewZoomEditor } from './zoom-editor';
import { ReviewCanvasSettings, ReviewSceneAudio } from './scene-inspector';
import { ReviewBackgroundInspector } from './background-inspector';
import { ReviewZoomInspector, ReviewZoomLinkInspector } from './zoom-inspector';

type ReviewAdvancedPanelsProps = {
  advanced: QuickEditAdvancedState;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  /** Optional framing preview mounted inside the selected region inspector. */
  zoomPreview?(region: QuickEditZoomRegion): ReactNode;
};

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
      ) : null}
    </>
  );
}

/** Scene controls are independent of the selected zoom and its property panel. */
export function ReviewSceneProperties(props: {
  background: QuickEditAdvancedState['background'];
  canvas: QuickEditAdvancedState['canvas'];
  source: { width: number; height: number };
  audio: QuickEditAdvancedState['audio'];
  hasOriginalAudio: boolean;
  onCanvas(canvas: QuickEditAdvancedState['canvas']): void;
  onOriginalVolume(volume: number): void;
  onLaneVolume(lane: 'voiceover' | 'music', volume: number): void;
  busy: boolean;
  pending: boolean;
  failed: boolean;
  onImportImage(file: File): void;
  setBackground(
    update: (current: QuickEditAdvancedState['background']) => QuickEditAdvancedState['background']
  ): void;
}) {
  return (
    <fieldset disabled={props.busy} className="min-w-0 space-y-4">
      <ReviewCanvasSettings source={props.source} canvas={props.canvas} onChange={props.onCanvas} />
      {props.pending ? (
        <p role="status">{translate('gallery.videoReview.backgroundImporting')}</p>
      ) : null}
      {props.failed ? (
        <p role="alert">{translate('gallery.videoReview.backgroundImportFailed')}</p>
      ) : null}
      <ReviewBackgroundInspector
        background={props.background}
        onImportImage={props.onImportImage}
        onChange={(patch) =>
          props.setBackground((current) => updateQuickEditBackground(current, patch))
        }
      />
      <ReviewSceneAudio
        audio={props.audio}
        hasOriginalAudio={props.hasOriginalAudio}
        onOriginal={props.onOriginalVolume}
        onLaneVolume={props.onLaneVolume}
      />
    </fieldset>
  );
}
