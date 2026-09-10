import { resolveTimelineFxCoverage } from '../../tracks/fx-layout';
import { resolveEffectOwner } from '../../../../../features/video/project/effect-instance/owner';
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
  layout: Pick<
    TimelineTrackLayout,
    'fxInstanceIds' | 'fxRows' | 'fxCollapsed' | 'fxHeight' | 'clipRowHeight'
  >;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  selectedId: string | null;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0"
      style={{ top: props.layout.clipRowHeight, height: props.layout.fxHeight }}
    >
      {props.layout.fxCollapsed ? (
        <ClipFxOverview {...props} />
      ) : (
        props.layout.fxRows.flatMap((row, index) =>
          row.map((id) => {
            const instance = props.project.effectInstances?.find((item) => item.id === id);
            return instance ? (
              <ClipFxInterval key={id} {...props} instance={instance} index={index} />
            ) : null;
          })
        )
      )}
    </div>
  );
}

function ClipFxOverview(props: Parameters<typeof ClipFxRows>[0]) {
  const ids = new Set(props.layout.fxInstanceIds);
  const ranges = resolveTimelineFxCoverage(
    (props.project.effectInstances ?? []).filter((item) => ids.has(item.id))
  );
  return (
    <div aria-hidden="true" data-clip-fx-overview>
      {ranges.map((range) => (
        <span
          key={range.startTime}
          className="absolute top-1.5 h-2 rounded-sm bg-[var(--sniptale-color-text-muted)] opacity-40"
          style={{
            left: props.projection
              ? timelineTimeToViewportX(props.projection, range.startTime)
              : range.startTime * props.pixelsPerSecond,
            width: Math.max(2, range.duration * props.pixelsPerSecond),
          }}
        />
      ))}
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
  const disabled = !instance.enabled || clip.bypassed || !track.visible;
  const collapsed = props.layout.fxCollapsed;
  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      data-clip-fx={instance.id}
      className={[
        'video-editor-timeline-item pointer-events-auto absolute flex items-center rounded-[4px] border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-hover)]',
        props.selectedId === instance.id ? 'video-editor-timeline-item-selected' : '',
      ].join(' ')}
      style={{
        left: x,
        width: Math.max(4, instance.duration * props.pixelsPerSecond),
        top: collapsed ? 4 : props.index * 24 + 2,
        height: collapsed ? 12 : 20,
        opacity: disabled ? 0.45 : 1,
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
          'h-full min-w-0 flex-1 !cursor-grab truncate px-2 text-left text-[10px]',
          'focus-visible:outline focus-visible:outline-1',
        ].join(' ')}
      >
        {!collapsed && <>{label}</>}
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
            className="absolute inset-y-0 z-10 w-2 !cursor-ew-resize"
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
  const clip = resolveEffectOwner(props.project, target);
  const track = clip;
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
