import { ProductRange } from '@sniptale/ui/product-form-controls';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { translate } from '../../platform/i18n';
import { videoTime } from './video-thumbnail';
import './video-timeline.css';
import type { VideoFrameHover } from './video-frame-placement';

/** Keeps timeline pointer and keyboard intent aligned with the seek range. */
export function VideoTimelineInput({
  duration,
  time,
  ready,
  seek,
  rangeRef,
  setHover,
}: {
  duration: number;
  time: number;
  ready: boolean;
  seek(value: number): void;
  rangeRef: RefObject<HTMLInputElement | null>;
  setHover: Dispatch<SetStateAction<VideoFrameHover | null>>;
}) {
  return (
    <ProductRange
      ref={rangeRef}
      type="range"
      min={0}
      max={duration || 1}
      step="any"
      value={Math.min(time, duration)}
      disabled={!ready}
      aria-label={translate('gallery.preview.player.seek')}
      aria-valuetext={`${videoTime(time)} / ${videoTime(duration)}`}
      onChange={(event) => {
        const nextTime = event.currentTarget.valueAsNumber;
        seek(nextTime);
        setHover((current) => (current ? { time: nextTime, clientX: current.clientX } : null));
      }}
      onPointerMove={(event) => {
        if (!ready) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (bounds.width > 0)
          setHover({
            time: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * duration,
            clientX: event.clientX,
          });
      }}
      onFocus={() => setHover({ time, clientX: null })}
      onBlur={() => setHover(null)}
      className="sniptale-video-seek block w-full"
    />
  );
}
