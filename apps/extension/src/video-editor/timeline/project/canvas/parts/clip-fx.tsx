import { useEffect, useRef, useState } from 'react';
import { getEffectInstanceLabel } from '../../../../../features/video/project/effect-instance/presentation';
import { resizeClipEffectInterval } from '../../../../../features/video/project/effect-instance/editing';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { VideoProjectEffectInstance } from '../../../../../features/video/project/effect-instance/types';
import { useVideoEditorEffectEditingPort } from '../../../../runtime/controller/store';
import { startWindowPointerSession } from '../../../../interaction/pointer-session';
import { translate } from '../../../../../platform/i18n';
import type { TimelineTrackLayout } from '../../tracks/layout';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../hover-preview';
import {
  timelineTimeToViewportX,
  type TimelineProjection,
} from '../../interaction-state/projection';

export function ClipFxRows(props: {
  project: VideoProject;
  layout: TimelineTrackLayout;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  selectedId: string | null;
}) {
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: props.layout.clipRowHeight, height: props.layout.fxHeight }}
    >
      {props.layout.fxInstanceIds.map((id, index) => {
        const instance = props.project.effectInstances?.find((item) => item.id === id);
        return instance ? (
          <ClipFxInterval key={id} {...props} instance={instance} index={index} />
        ) : null;
      })}
    </div>
  );
}

function ClipFxInterval(
  props: Parameters<typeof ClipFxRows>[0] & { instance: VideoProjectEffectInstance; index: number }
) {
  const { instance, clip, track, begin, select, actions } = useClipFxInteraction(props);
  if (!clip || !track) return null;
  const label = getEffectInstanceLabel(props.project, instance.id);
  const x = props.projection
    ? timelineTimeToViewportX(props.projection, instance.startTime)
    : instance.startTime * props.pixelsPerSecond;
  const disabled = !instance.enabled || clip.effectsBypassed || !track.visible;
  const collapsed = props.layout.fxCollapsed;
  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      data-clip-fx={instance.id}
      className={[
        'absolute flex items-center rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-hover)] hover:outline hover:outline-1',
        'hover:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
      style={{
        left: x,
        width: Math.max(4, instance.duration * props.pixelsPerSecond),
        top: collapsed ? 4 : props.index * 24 + 2,
        height: collapsed ? 12 : 20,
        opacity: disabled ? 0.45 : 1,
        outline:
          props.selectedId === instance.id ? '1px solid var(--sniptale-color-accent)' : undefined,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          select();
        }}
        onPointerDown={(event) => begin(event, 'move')}
        onKeyDown={(event) => {
          if (!track.locked && (event.key === 'Delete' || event.key === 'Backspace')) {
            event.preventDefault();
            event.stopPropagation();
            actions.deleteEffectInstance(instance.id);
            return;
          }
          if (
            !track.locked &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'd'
          ) {
            event.preventDefault();
            event.stopPropagation();
            actions.duplicateEffectInstance(instance.id);
            return;
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          if (!track.locked)
            actions.updateEffectInstance(instance.id, {
              startTime:
                instance.startTime +
                (event.key === 'ArrowRight' ? 1 : -1) *
                  (event.shiftKey ? 1 : 1 / props.project.fps),
            });
        }}
        className={[
          'h-full min-w-0 flex-1 cursor-grab truncate px-2 text-left text-[10px]',
          'hover:text-[var(--sniptale-color-accent)] focus-visible:outline focus-visible:outline-1',
        ].join(' ')}
      >
        {!collapsed && (
          <>
            FX {props.index + 1} · {label}
          </>
        )}
      </button>
      {!collapsed &&
        !track.locked &&
        (['start', 'end'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            title={translate(
              mode === 'start'
                ? 'videoEditor.effectsLibrary.resizeFxStart'
                : 'videoEditor.effectsLibrary.resizeFxEnd'
            )}
            aria-label={translate(
              mode === 'start'
                ? 'videoEditor.effectsLibrary.resizeFxStart'
                : 'videoEditor.effectsLibrary.resizeFxEnd'
            )}
            className="absolute inset-y-0 w-1 cursor-ew-resize"
            style={mode === 'start' ? { left: 0 } : { right: 0 }}
            onPointerDown={(event) => begin(event, mode)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              event.stopPropagation();
              const delta = (event.key === 'ArrowRight' ? 1 : -1) / props.project.fps;
              actions.updateEffectInstance(
                instance.id,
                resolveFxGestureRange({
                  instance,
                  clip,
                  mode,
                  delta,
                  minDuration: 1 / props.project.fps,
                })
              );
            }}
          />
        ))}
    </div>
  );
}

function useClipFxInteraction(
  props: Parameters<typeof ClipFxRows>[0] & { instance: VideoProjectEffectInstance; index: number }
) {
  const actions = useVideoEditorEffectEditingPort((port) => port);
  const cleanup = useRef<(() => void) | null>(null);
  const [draft, setDraft] = useState<VideoProjectEffectInstance | null>(null);
  const currentProject = useRef(props.project);
  currentProject.current = props.project;
  useEffect(() => () => cleanup.current?.(), []);
  const instance = draft ?? props.instance;
  const target = instance.target;
  const clip = props.project.clips.find(
    (clip) => target.kind === 'clip' && clip.id === target.clipId
  );
  const track = props.project.tracks.find((track) => track.id === clip?.trackId);
  const collapsed = props.layout.fxCollapsed;
  const select = () => actions.selectEffectInstance(instance.id);
  const begin = (event: React.PointerEvent, mode: 'move' | 'start' | 'end') => {
    if (event.button !== 0 || !clip || !track) return;
    event.preventDefault();
    event.stopPropagation();
    select();
    if (track.locked || collapsed) return;
    cleanup.current?.();
    const origin = event.clientX;
    const project = props.project;
    let next = props.instance;
    cleanup.current = startWindowPointerSession({
      cursor: mode === 'move' ? 'grabbing' : 'ew-resize',
      onMove: (pointer) => {
        const delta = (pointer.clientX - origin) / props.pixelsPerSecond;
        next = resizeClipEffectInterval(
          project,
          props.instance,
          resolveFxGestureRange({
            instance: props.instance,
            clip,
            mode,
            delta,
            minDuration: 1 / project.fps,
          })
        );
        setDraft(next);
      },
      onCancel: () => setDraft(null),
      onEnd: () => {
        setDraft(null);
        if (currentProject.current === project && next !== props.instance)
          actions.updateEffectInstance(instance.id, {
            startTime: next.startTime,
            duration: next.duration,
            rangeMode: 'interval',
          });
      },
    });
  };
  return { instance, clip, track, begin, select, actions };
}

/** Pointer and keyboard resize preserve the opposite endpoint at both boundaries. */
function resolveFxGestureRange(args: {
  instance: VideoProjectEffectInstance;
  clip: { startTime: number; duration: number };
  mode: 'move' | 'start' | 'end';
  delta: number;
  minDuration: number;
}) {
  const { instance, clip, mode, delta, minDuration } = args;
  const startTime =
    mode === 'start'
      ? Math.max(
          clip.startTime,
          Math.min(instance.startTime + delta, instance.startTime + instance.duration - minDuration)
        )
      : instance.startTime + (mode === 'move' ? delta : 0);
  const duration =
    mode === 'move'
      ? instance.duration
      : mode === 'start'
        ? instance.startTime + instance.duration - startTime
        : Math.max(
            minDuration,
            Math.min(instance.duration + delta, clip.startTime + clip.duration - startTime)
          );
  return { startTime, duration };
}
