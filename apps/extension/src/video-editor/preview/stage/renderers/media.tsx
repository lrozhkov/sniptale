import { isVideoClip } from '../../../../features/video/project/timeline';
import { VideoProjectClipType } from '../../../../features/video/project/types/index';
import { getMediaFitClass } from '../canvas/clip-layout';
import {
  getPreviewClipFrameClassName,
  type ImagePreviewClipParams,
  type MediaPreviewRendererParams,
  type VideoPreviewClipParams,
} from './shared';

function renderVideoPreviewClip({
  clip,
  src,
  commonStyle,
  onBeginInteraction,
  selectedClipId,
  videoRefs,
}: VideoPreviewClipParams) {
  if (!src) {
    return null;
  }

  return (
    <div
      key={clip.id}
      style={commonStyle}
      data-preview-media-shadow-wrapper=""
      className="group"
      onPointerDown={(event) => onBeginInteraction(event, clip, 'move')}
    >
      <div
        data-preview-media-frame=""
        className={[
          getPreviewClipFrameClassName(selectedClipId, clip.id),
          'h-full w-full bg-[color:var(--sniptale-color-surface-panel)]',
        ].join(' ')}
      >
        <video
          ref={(node) => {
            if (node) {
              videoRefs.current[clip.id] = node;
              return;
            }

            delete videoRefs.current[clip.id];
          }}
          src={src}
          muted
          playsInline
          className={`h-full w-full ${getMediaFitClass(clip.fitMode)}`}
        />
      </div>
    </div>
  );
}

function renderImagePreviewClip({
  clip,
  src,
  commonStyle,
  onBeginInteraction,
  selectedClipId,
}: ImagePreviewClipParams) {
  if (!src) {
    return null;
  }

  return (
    <button
      key={clip.id}
      type="button"
      style={commonStyle}
      data-preview-media-shadow-wrapper=""
      className="text-left"
      onPointerDown={(event) => onBeginInteraction(event, clip, 'move')}
    >
      <span
        data-preview-media-frame=""
        className={[
          getPreviewClipFrameClassName(selectedClipId, clip.id),
          'block h-full w-full bg-[color:var(--sniptale-color-surface-overlay)]',
        ].join(' ')}
      >
        <img
          src={src}
          alt={clip.name}
          className={`h-full w-full ${getMediaFitClass(clip.fitMode)}`}
        />
      </span>
    </button>
  );
}

export function renderMediaPreviewClip(params: MediaPreviewRendererParams) {
  if (isVideoClip(params.clip)) {
    return renderVideoPreviewClip({
      clip: params.clip,
      src: params.assetUrls[params.clip.assetId],
      commonStyle: params.commonStyle,
      onBeginInteraction: params.onBeginInteraction,
      selectedClipId: params.selectedClipId,
      videoRefs: params.videoRefs,
    });
  }

  if (params.clip.type === VideoProjectClipType.IMAGE) {
    return renderImagePreviewClip({
      clip: params.clip,
      src: params.assetUrls[params.clip.assetId],
      commonStyle: params.commonStyle,
      onBeginInteraction: params.onBeginInteraction,
      selectedClipId: params.selectedClipId,
    });
  }

  return null;
}
