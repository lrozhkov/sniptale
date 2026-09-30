import type { RefObject } from 'react';
import type { VideoFrameSnapshot } from './video-frame-cache';
import { VideoThumbnail } from './video-thumbnail';

/** Renders the measured frame surface without owning seek or decode work. */
export function VideoFramePopover({
  popupRef,
  placement,
  snapshot,
}: {
  popupRef: RefObject<HTMLDivElement | null>;
  placement: { left: number; top: number; width: number } | null;
  snapshot: VideoFrameSnapshot;
}) {
  return (
    <div
      ref={popupRef}
      data-ui="gallery.preview.player.framePopover"
      className="pointer-events-none absolute z-20"
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: placement?.width ?? 192,
        visibility: placement ? 'visible' : 'hidden',
      }}
    >
      <VideoThumbnail snapshot={snapshot} />
    </div>
  );
}
