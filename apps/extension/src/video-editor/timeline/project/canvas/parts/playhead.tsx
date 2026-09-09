import { useLayoutEffect, useRef } from 'react';
import { translate } from '../../../../../platform/i18n';
import { formatPreciseTime } from '../../interaction-state/helpers';

export function ProjectTimelinePlayheadLine(props: {
  height: number;
  left: number;
  isPlaying?: boolean | undefined;
}) {
  const ref = usePlayheadPosition(props.left, props.isPlaying);
  return (
    <div
      ref={ref}
      data-ui="video-editor.timeline.playhead-line"
      aria-hidden="true"
      className={[
        'pointer-events-none absolute top-0 z-30 w-px bg-[var(--sniptale-color-accent-emphasis)]',
      ].join(' ')}
      style={{ left: props.left, height: props.height }}
    />
  );
}

export function ProjectTimelinePlayheadHandle(props: {
  isPlaying?: boolean | undefined;
  currentTime: number;
  duration: number;
  left: number;
  onBeginScrub: (event: React.PointerEvent<HTMLElement>, currentTime: number) => void;
  onSeekTime: (time: number) => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
}) {
  const ref = usePlayheadPosition(props.left, props.isPlaying);
  return (
    <div
      ref={ref}
      data-ui="video-editor.timeline.playhead-handle"
      role="slider"
      tabIndex={0}
      aria-label={translate('videoEditor.timeline.playhead')}
      aria-valuemin={0}
      aria-valuemax={props.duration}
      aria-valuenow={props.currentTime}
      aria-valuetext={formatPreciseTime(props.currentTime)}
      className={[
        'absolute top-0 z-10 h-[8px] w-3 cursor-ew-resize rounded-b-[3px]',
        'before:absolute before:inset-x-0 before:top-0 before:h-[30px]',
        'after:absolute after:left-1/2 after:top-full after:h-[22px] after:w-px',
        'after:bg-[var(--sniptale-color-accent-emphasis)]',
        'border border-[var(--sniptale-color-border-accent-strong)]',
        'bg-[var(--sniptale-color-accent-emphasis)]',

        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      style={{ left: props.left, transform: 'translateX(-50%)' }}
      onPointerDown={(event) => props.onBeginScrub(event, props.currentTime)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          props.onSeekTime(event.key === 'Home' ? 0 : props.duration);
          return;
        }
        const isPreviousFrameKey = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
        const isNextFrameKey = event.key === 'ArrowRight' || event.key === 'ArrowUp';
        if (event.defaultPrevented || (!isPreviousFrameKey && !isNextFrameKey)) {
          return;
        }
        event.preventDefault();
        if (isPreviousFrameKey) props.onStepToPreviousFrame();
        else props.onStepToNextFrame();
      }}
    />
  );
}

/** Smooth small forward updates; pause, backward movement and large jumps settle immediately. */
function usePlayheadPosition(left: number, isPlaying?: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(left);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from =
      animation.current?.playState === 'running'
        ? parseFloat(getComputedStyle(node).left)
        : previous.current;
    animation.current?.cancel();
    const distance = left - previous.current;
    if (
      isPlaying &&
      distance > 0 &&
      distance < 80 &&
      node.animate &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      animation.current = node.animate([{ left: `${from}px` }, { left: `${left}px` }], {
        duration: 32,
        easing: 'linear',
      });
    }
    previous.current = left;
  }, [left, isPlaying]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return ref;
}
