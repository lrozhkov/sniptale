import { translate } from '../../../../../platform/i18n';
import { formatPreciseTime } from '../../interaction-state/helpers';

export function ProjectTimelinePlayheadLine(props: { height: number; left: number }) {
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none absolute top-0 z-30 w-px bg-[var(--sniptale-color-accent-emphasis)]',
        'shadow-[0_0_12px_color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_65%,transparent)]',
      ].join(' ')}
      style={{ left: props.left, height: props.height }}
    />
  );
}

export function ProjectTimelinePlayheadHandle(props: {
  currentTime: number;
  duration: number;
  left: number;
  onBeginScrub: (event: React.PointerEvent<HTMLElement>, currentTime: number) => void;
  onSeekTime: (time: number) => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
}) {
  return (
    <div
      data-ui="video-editor.timeline.playhead-handle"
      role="slider"
      tabIndex={0}
      aria-label={translate('videoEditor.timeline.playhead')}
      aria-valuemin={0}
      aria-valuemax={props.duration}
      aria-valuenow={props.currentTime}
      aria-valuetext={formatPreciseTime(props.currentTime)}
      className={[
        'absolute top-0 z-10 h-4 w-3 cursor-ew-resize rounded-b-[5px]',
        'border border-[var(--sniptale-color-border-accent-strong)]',
        'bg-[var(--sniptale-color-accent-emphasis)]',
        'shadow-[0_2px_8px_color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_35%,transparent)]',
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
