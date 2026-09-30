import { useEffect, useRef, useState, type RefObject } from 'react';
import { VideoFramePopover } from './video-frame-popover';
import { useVideoFramePlacement, type VideoFrameHover } from './video-frame-placement';
import { useVideoFramePreview } from './video-frame-preview';
import { VideoTimelineInput } from './video-timeline-input';

/** Owns transient timeline previews independently of playback commands. */
export function VideoTimeline({
  src,
  duration,
  time,
  ready,
  seek,
  playerRef,
}: {
  src: string;
  duration: number;
  time: number;
  ready: boolean;
  seek(value: number): void;
  playerRef: RefObject<HTMLDivElement | null>;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<VideoFrameHover | null>(null);
  const { sampleTime, snapshot } = useVideoFramePreview({ src, duration, hover, ready });

  useEffect(() => {
    if (!ready) setHover(null);
  }, [ready]);

  const placement = useVideoFramePlacement({
    duration,
    hover,
    playerRef,
    popupRef,
    rangeRef,
    ready,
    timelineRef,
  });

  return (
    <div
      ref={timelineRef}
      data-ui="gallery.preview.player.timeline"
      className="relative"
      onPointerLeave={() => setHover((current) => (current?.clientX !== null ? null : current))}
    >
      {hover !== null && ready ? (
        <VideoFramePopover
          popupRef={popupRef}
          placement={placement}
          snapshot={snapshot ?? { sampleTime: sampleTime ?? 0, status: 'loading' }}
        />
      ) : null}
      <VideoTimelineInput
        rangeRef={rangeRef}
        duration={duration}
        time={time}
        ready={ready}
        seek={seek}
        setHover={setHover}
      />
    </div>
  );
}
