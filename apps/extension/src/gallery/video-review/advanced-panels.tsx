import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import { ReviewButton } from './controls';
import { ReviewPresentationBinding } from './presentation-binding';
import { ReviewWatermarkInspector } from './watermark-inspector';
import type { ComponentProps } from 'react';
import {
  Scan,
  Wallpaper,
  Stamp,
  AudioLines,
  PanelTop,
  Clapperboard,
  Captions,
  Navigation,
} from 'lucide-react';
import { ReviewCaptionSceneControls } from './caption-controls';
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
  cursorPath?: CursorFocusPath;
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
          cameraFollowDefaults={args.advanced.cameraFollowDefaults}
          cursorPath={args.cursorPath}
          spatialPreview={args.zoom.previewRegion(zoomRegion)}
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
  cursorPath?: ReactNode;
  focus?: { advanced: QuickEditAdvancedState; time: number } | undefined;
  background: QuickEditAdvancedState['background'];
  onPreviewBackground?(background: QuickEditAdvancedState['background'] | null): void;
  canvas: QuickEditAdvancedState['canvas'];
  captions?: QuickEditAdvancedState['captions'];
  onCaptions?(settings: NonNullable<QuickEditAdvancedState['captions']>): void;
  presentation?: ComponentProps<typeof ReviewPresentationBinding>;
  watermark?: ComponentProps<typeof ReviewWatermarkInspector>;
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
    <>
      {props.presentation?.editor.pending &&
      props.presentation.editor.picker?.source === 'computer' ? (
        <ReviewButton
          label={translate('common.actions.cancel')}
          onClick={props.presentation.editor.cancel}
        />
      ) : null}
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
              icon: Wallpaper,
              content: (
                <ReviewBackgroundInspector
                  background={props.background}
                  pending={props.pending}
                  onImportImage={props.onImportImage}
                  onPreview={(patch) =>
                    props.onPreviewBackground?.(
                      patch ? updateQuickEditBackground(props.background, patch) : null
                    )
                  }
                  onChange={(patch) =>
                    props.setBackground((current) => updateQuickEditBackground(current, patch))
                  }
                />
              ),
            },
            ...(props.presentation
              ? [
                  {
                    id: 'presentation',
                    label: translate('gallery.videoReview.presentation'),
                    icon: Clapperboard,
                    content: <ReviewPresentationBinding {...props.presentation} />,
                  },
                ]
              : []),
            ...(props.watermark
              ? [
                  {
                    id: 'watermark',
                    label: translate('gallery.videoReview.watermark'),
                    icon: Stamp,
                    content: <ReviewWatermarkInspector {...props.watermark} />,
                  },
                ]
              : []),
            ...(props.onCaptions
              ? [
                  {
                    id: 'captions',
                    label: translate('gallery.videoReview.captions'),
                    icon: Captions,
                    content: (
                      <ReviewCaptionSceneControls
                        settings={props.captions}
                        onChange={props.onCaptions}
                        disabled={props.busy}
                      />
                    ),
                  },
                ]
              : []),
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
            ...(props.cursorPath
              ? [
                  {
                    id: 'cursor-path',
                    label: translate('videoEditor.sidebar.cursorFocusPathTitle'),
                    icon: Navigation,
                    content: props.cursorPath,
                  },
                ]
              : []),
          ]}
        />
      </fieldset>
    </>
  );
}
