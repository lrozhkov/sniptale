import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';
import type { TimelineEffectSelection } from '../types';
import {
  EFFECT_SEGMENT_BASE_CLASS_NAME,
  EFFECT_SEGMENT_CONTENT_CLASS_NAME,
  EFFECT_SEGMENT_DEFAULT_HEIGHT,
  EFFECT_SEGMENT_HANDLE_CLASS_NAME,
  EFFECT_SEGMENT_SELECTED_CLASS_NAME,
  EFFECT_SEGMENT_WARNING_CLASS_NAME,
} from './segment.constants';

interface ProjectTimelineEffectSegmentProps {
  className: string;
  height?: number;
  hidden?: boolean;
  isSelected: boolean;
  label: string;
  leadingIcon?: React.ReactNode;
  left: number;
  onBeginEffectInteraction: React.PointerEventHandler<HTMLButtonElement>;
  onBeginTrimEndInteraction?: React.PointerEventHandler<HTMLButtonElement>;
  onBeginTrimStartInteraction?: React.PointerEventHandler<HTMLButtonElement>;
  stateIcon?: React.ReactNode;
  status?: 'normal' | 'warning';
  subtitle?: string;
  title?: string;
  top?: number;
  width: number;
}

export function ProjectTimelineEffectSegment(props: ProjectTimelineEffectSegmentProps) {
  const height = props.height ?? EFFECT_SEGMENT_DEFAULT_HEIGHT;
  return (
    <div
      className="absolute"
      style={{
        height,
        left: props.left,
        top: props.top ?? `calc(50% - ${height / 2}px)`,
        width: props.width,
      }}
    >
      <ProjectTimelineEffectSegmentHandle
        align="left"
        ariaLabel={`${props.label}:resize-start`}
        onPointerDown={props.onBeginTrimStartInteraction}
      />
      <ProjectTimelineEffectSegmentButton
        className={props.className}
        hidden={props.hidden ?? false}
        isSelected={props.isSelected}
        label={props.label}
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
        onPointerDown={props.onBeginTrimEndInteraction}
      />
    </div>
  );
}

function ProjectTimelineEffectSegmentButton(props: {
  className: string;
  hidden: boolean;
  isSelected: boolean;
  label: string;
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
      title={props.title ?? props.label}
      aria-label={props.title ?? props.label}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={props.onBeginEffectInteraction}
      className={[
        EFFECT_SEGMENT_BASE_CLASS_NAME,
        props.className,
        props.hidden ? 'opacity-45 saturate-[0.55]' : '',
        props.status === 'warning' ? EFFECT_SEGMENT_WARNING_CLASS_NAME : '',
        props.isSelected ? EFFECT_SEGMENT_SELECTED_CLASS_NAME : '',
      ].join(' ')}
    >
      <ProjectTimelineEffectSegmentBody
        label={props.label}
        leadingIcon={props.leadingIcon}
        stateIcon={props.stateIcon}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
      />
    </button>
  );
}

function ProjectTimelineEffectSegmentBody({
  label,
  leadingIcon,
  stateIcon,
  subtitle,
}: {
  label: string;
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
            'min-w-0 truncate text-[10px] font-semibold leading-none',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {label}
        </div>
        <ProjectTimelineEffectSegmentSubtitle subtitle={subtitle} />
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

function ProjectTimelineEffectSegmentSubtitle({ subtitle }: { subtitle: string | undefined }) {
  if (!subtitle) return null;
  return (
    <>
      <div className="shrink-0 text-[10px] leading-none text-[var(--sniptale-color-text-dim)]">
        ·
      </div>
      <div
        className={[
          'min-w-0 truncate text-[9px] uppercase leading-none',
          'text-[var(--sniptale-color-text-dim)]',
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
