import { createContext, useContext } from 'react';
import { projectTimelineInterval, type TimelineProjection } from '../interaction-state/projection';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';
import type { TimelineEffectSelection, TimelineEffectDragDraft } from '../types';
import {
  EFFECT_SEGMENT_BASE_CLASS_NAME,
  EFFECT_SEGMENT_CONTENT_CLASS_NAME,
  EFFECT_SEGMENT_DEFAULT_HEIGHT,
  EFFECT_SEGMENT_HANDLE_CLASS_NAME,
  EFFECT_SEGMENT_SELECTED_CLASS_NAME,
  EFFECT_SEGMENT_WARNING_CLASS_NAME,
} from './segment.constants';

export const TimelineEffectDraftContext = createContext<TimelineEffectDragDraft | null>(null);

interface ProjectTimelineEffectSegmentProps {
  segmentId: string;
  movable?: boolean;
  className: string;
  height?: number;
  hidden?: boolean;
  isSelected: boolean;
  label: string;
  hideLabel?: boolean | undefined;
  leadingIcon?: React.ReactNode;
  startTime: number;
  endTime: number;
  pixelsPerSecond: number;
  minimumWidth?: number;
  projection?: TimelineProjection | undefined;
  onBeginEffectInteraction: React.PointerEventHandler<HTMLButtonElement>;
  onBeginTrimEndInteraction?: React.PointerEventHandler<HTMLButtonElement>;
  onBeginTrimStartInteraction?: React.PointerEventHandler<HTMLButtonElement>;
  stateIcon?: React.ReactNode;
  status?: 'normal' | 'warning';
  subtitle?: string;
  title?: string;
  top?: number;
}

export function ProjectTimelineEffectSegment(props: ProjectTimelineEffectSegmentProps) {
  const draft = useContext(TimelineEffectDraftContext);
  const activeDraft =
    draft?.segmentId === props.segmentId && !draft.cursorSampleTimes ? draft : null;
  const startTime = activeDraft?.startTime ?? props.startTime;
  const endTime = startTime + (activeDraft?.duration ?? props.endTime - props.startTime);
  const geometry = props.projection
    ? projectTimelineInterval(props.projection, startTime, endTime)
    : {
        left: startTime * props.pixelsPerSecond,
        width: (endTime - startTime) * props.pixelsPerSecond,
        includesStart: true,
        includesEnd: true,
      };
  if (!geometry) return null;
  const height = props.height ?? EFFECT_SEGMENT_DEFAULT_HEIGHT;
  return (
    <div
      data-timeline-effect-segment={props.segmentId}
      data-timeline-effect-draft={activeDraft ? true : undefined}
      className="absolute"
      style={{
        height,
        left: geometry.left,
        top: props.top ?? `calc(50% - ${height / 2}px)`,
        width: Math.max(props.minimumWidth ?? 0, geometry.width),
      }}
    >
      <ProjectTimelineEffectSegmentHandle
        align="left"
        ariaLabel={`${props.label}:resize-start`}
        onPointerDown={
          geometry.includesStart && props.movable !== false
            ? props.onBeginTrimStartInteraction
            : undefined
        }
      />
      <ProjectTimelineEffectSegmentButton
        className={props.className}
        movable={props.movable !== false}
        hidden={props.hidden ?? false}
        isSelected={props.isSelected}
        label={props.label}
        hideLabel={props.hideLabel}
        leadingIcon={props.leadingIcon}
        onBeginEffectInteraction={props.onBeginEffectInteraction}
        stateIcon={props.stateIcon}
        status={props.status ?? 'normal'}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
        {...(props.title ? { title: props.title } : {})}
      />
      <ProjectTimelineEffectSegmentHandle
        align="right"
        ariaLabel={`${props.label}:resize-end`}
        onPointerDown={
          geometry.includesEnd && props.movable !== false
            ? props.onBeginTrimEndInteraction
            : undefined
        }
      />
    </div>
  );
}

function ProjectTimelineEffectSegmentButton(props: {
  movable: boolean;
  className: string;
  hidden: boolean;
  isSelected: boolean;
  label: string;
  hideLabel?: boolean | undefined;
  leadingIcon?: React.ReactNode;
  onBeginEffectInteraction: React.PointerEventHandler<HTMLButtonElement>;
  stateIcon?: React.ReactNode;
  status: 'normal' | 'warning';
  subtitle?: string;
  title?: string;
}) {
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      data-timeline-item-muted={props.hidden}
      title={props.title ?? props.label}
      aria-label={props.title ?? props.label}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={props.onBeginEffectInteraction}
      className={[
        EFFECT_SEGMENT_BASE_CLASS_NAME,
        props.movable ? '!cursor-grab' : '!cursor-pointer',
        props.className,
        props.status === 'warning' ? EFFECT_SEGMENT_WARNING_CLASS_NAME : '',
        props.isSelected ? EFFECT_SEGMENT_SELECTED_CLASS_NAME : '',
      ].join(' ')}
    >
      <ProjectTimelineEffectSegmentBody
        label={props.label}
        hideLabel={props.hideLabel}
        leadingIcon={props.leadingIcon}
        stateIcon={props.stateIcon}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
      />
    </button>
  );
}

function ProjectTimelineEffectSegmentBody({
  label,
  hideLabel,
  leadingIcon,
  stateIcon,
  subtitle,
}: {
  label: string;
  hideLabel?: boolean | undefined;
  leadingIcon?: React.ReactNode;
  stateIcon?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className={EFFECT_SEGMENT_CONTENT_CLASS_NAME}>
      <ProjectTimelineEffectSegmentIcon icon={leadingIcon} tone="secondary" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <div
          className={[
            hideLabel ? 'sr-only' : 'min-w-0 truncate text-[10px] font-semibold leading-none',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {label}
        </div>
        <ProjectTimelineEffectSegmentSubtitle subtitle={subtitle} separator={!hideLabel} />
      </div>
      <ProjectTimelineEffectSegmentIcon icon={stateIcon} tone="warning" />
    </div>
  );
}

function ProjectTimelineEffectSegmentIcon(props: {
  icon: React.ReactNode | undefined;
  tone: 'secondary' | 'warning';
}) {
  if (!props.icon) return null;
  return (
    <span
      className={[
        'flex h-4 w-4 shrink-0 items-center justify-center',
        props.tone === 'warning'
          ? 'text-[var(--sniptale-color-warning)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      {props.icon}
    </span>
  );
}

function ProjectTimelineEffectSegmentSubtitle({
  subtitle,
  separator,
}: {
  subtitle: string | undefined;
  separator: boolean;
}) {
  if (!subtitle) return null;
  return (
    <>
      {separator ? (
        <div className="shrink-0 text-[10px] leading-none text-[var(--sniptale-color-text-dim)]">
          ·
        </div>
      ) : null}
      <div
        className={[
          'min-w-0 truncate text-[11px] tabular-nums leading-none',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {subtitle}
      </div>
    </>
  );
}

function ProjectTimelineEffectSegmentHandle(props: {
  align: 'left' | 'right';
  ariaLabel: string;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement> | undefined;
}) {
  if (!props.onPointerDown) return null;

  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      aria-label={props.ariaLabel}
      className={`${EFFECT_SEGMENT_HANDLE_CLASS_NAME} ${props.align}-0`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={props.onPointerDown}
    />
  );
}

export function isSelectedEffectSegment(
  selection: TimelineEffectSelection | null,
  kind: TimelineEffectSelection['kind'],
  segmentId: string
) {
  return selection?.kind === kind && selection.segmentId === segmentId;
}
