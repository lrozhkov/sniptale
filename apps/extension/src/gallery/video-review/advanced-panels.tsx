import { quickEditSpatialSpan } from '../../features/video/review/advanced/spatial';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { Scan, Paintbrush, AudioLines, PanelTop } from 'lucide-react';
import { ReviewInspectorSections } from './inspector-sections';
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
import {
  ReviewCanvasSettings,
  ReviewSceneAudio,
  ReviewWindowHeaderSettings,
} from './scene-inspector';
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
          zoomConversionBlocked={!args.zoom.canConvertToZoom(zoomRegion)}
          onPreview={(patch) => args.zoom.preview(zoomRegion.id, patch)}
          cutSuppressed={
            !!zoomRegion.sourceAnchor &&
            !!args.advanced.audio.voiceoverSegments?.some(
              (part) =>
                part.kind === 'cut' &&
                part.sourceStart < zoomRegion.sourceAnchor!.end &&
                part.sourceEnd > zoomRegion.sourceAnchor!.start
            )
          }
          preview={args.zoomPreview?.(zoomRegion)}
          onChange={applyZoomRegionPatch.bind(null, args, zoomRegion.id)}
          onReset={resetZoomRegion.bind(null, args, zoomRegion.id)}
          onDuplicate={() => args.zoom.duplicate(zoomRegion.id)}
          onDelete={removeZoomRegion.bind(null, args, zoomRegion.id)}
        />
      ) : null}
    </>
  );
}

/** Scene controls are independent of the selected zoom and its property panel. */
export function ReviewSceneProperties(props: {
  focus?: { advanced: QuickEditAdvancedState; time: number } | undefined;
  background: QuickEditAdvancedState['background'];
  canvas: QuickEditAdvancedState['canvas'];
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  onWindowHeader?(header: QuickEditAdvancedState['windowHeader']): void;
  source: { width: number; height: number };
  audio: QuickEditAdvancedState['audio'];
  hasOriginalAudio: boolean;
  onCanvas(canvas: QuickEditAdvancedState['canvas']): void;
  onOriginalVolume(volume: number): void;
  onLaneVolume(lane: 'voiceover' | 'music', volume: number): void;
  busy: boolean;
  pending: boolean;
  failed: boolean;
  onImportImage(file: File, originMediaId?: string): void;
  setBackground(
    update: (current: QuickEditAdvancedState['background']) => QuickEditAdvancedState['background']
  ): void;
}) {
  return (
    <fieldset disabled={props.busy} className="min-w-0">
      {props.failed ? (
        <p role="alert">{translate('gallery.videoReview.backgroundImportFailed')}</p>
      ) : null}
      <ReviewInspectorSections
        sections={[
          {
            id: 'canvas',
            label: translate('gallery.videoReview.canvas'),
            icon: Scan,
            content: (
              <ReviewCanvasSettings
                source={props.source}
                canvas={props.canvas}
                onChange={props.onCanvas}
              />
            ),
          },
          {
            id: 'window-header',
            label: translate('gallery.videoReview.windowHeader'),
            icon: PanelTop,
            content: (
              <ReviewWindowHeaderSettings
                header={props.windowHeader}
                onChange={props.onWindowHeader}
              />
            ),
          },
          {
            id: 'background',
            label: translate('gallery.videoReview.background'),
            icon: Paintbrush,
            content: (
              <ReviewBackgroundInspector
                perspectiveFixed={
                  props.focus
                    ? quickEditSpatialSpan(
                        resolveQuickEditEffectiveState(props.focus.advanced).zoomRegions,
                        props.focus.time
                      )
                    : false
                }
                background={props.background}
                pending={props.pending}
                onImportImage={props.onImportImage}
                onChange={(patch) =>
                  props.setBackground((current) => updateQuickEditBackground(current, patch))
                }
              />
            ),
          },
          ...(props.hasOriginalAudio || props.audio.voiceover.length || props.audio.music.length
            ? [
                {
                  id: 'audio',
                  label: translate('gallery.videoReview.volume'),
                  icon: AudioLines,
                  content: (
                    <ReviewSceneAudio
                      audio={props.audio}
                      hasOriginalAudio={props.hasOriginalAudio}
                      onOriginal={props.onOriginalVolume}
                      onLaneVolume={props.onLaneVolume}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </fieldset>
  );
}
