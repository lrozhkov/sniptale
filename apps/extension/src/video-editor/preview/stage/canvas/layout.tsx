import React from 'react';
import { VIDEO_EDITOR_STAGE_STYLE } from '../../../chrome/styles';
import {
  PreviewStageShellLayout,
  resolvePreviewStageControls,
  type PreviewStageShellLayoutProps,
} from './shell';

const STAGE_FRAME_CLASS_NAME = [
  'relative flex min-h-0 flex-1 overflow-hidden rounded-[14px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_97%,var(--sniptale-color-surface-canvas)_3%)]',
].join(' ');

interface PreviewStageFrameProps extends Partial<Omit<PreviewStageShellLayoutProps, 'children'>> {
  children: React.ReactNode;
  onSelectScene?: () => void;
}

export const PreviewStageFrame = React.forwardRef<HTMLDivElement, PreviewStageFrameProps>(
  function PreviewStageFrame(props, ref) {
    return (
      <div
        ref={ref}
        style={VIDEO_EDITOR_STAGE_STYLE}
        className={STAGE_FRAME_CLASS_NAME}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            props.onSelectScene?.();
          }
        }}
      >
        <PreviewStageShellLayout
          {...resolvePreviewStageControls(props)}
          currentTime={props.currentTime ?? 0}
          duration={props.duration ?? 0}
          isFullscreen={props.isFullscreen ?? false}
          isPlaying={props.isPlaying ?? false}
          playbackRange={props.playbackRange ?? null}
          onCloseFullscreen={props.onCloseFullscreen ?? (() => undefined)}
          {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
          {...(props.onSeek ? { onSeek: props.onSeek } : {})}
          {...(props.onTogglePlay ? { onTogglePlay: props.onTogglePlay } : {})}
        >
          {props.children}
        </PreviewStageShellLayout>
      </div>
    );
  }
);
