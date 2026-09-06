import { translate } from '../../../../platform/i18n';
import { EFFECT_LANE_ROW_HEIGHT } from '../interaction-state/helpers';

const EFFECT_LANE_ROW_CLASS_NAME = [
  'relative border-b border-[var(--sniptale-color-border-subtle)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,transparent)]',
].join(' ');

const EFFECT_LANE_LABEL_CLASS_NAME = [
  'flex h-full items-center gap-2.5 px-3',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

const EFFECT_LANE_EMPTY_LABEL_CLASS_NAME = [
  'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

export function ProjectTimelineEffectLaneRow({
  children,
  onClick,
  onMouseLeave,
  onMouseMove,
  onPointerDown,
}: React.PropsWithChildren<{
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}>) {
  return (
    <div
      className={EFFECT_LANE_ROW_CLASS_NAME}
      data-project-timeline-effect-lane-row="true"
      style={{ height: EFFECT_LANE_ROW_HEIGHT }}
      onClick={(event) => {
        onClick?.(event);
        event.stopPropagation();
      }}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

export function ProjectTimelineEffectLaneEmptyLabel({ label }: { label?: string }) {
  return (
    <span className={EFFECT_LANE_EMPTY_LABEL_CLASS_NAME}>
      {label ?? translate('videoEditor.timeline.emptyLaneLabel')}
    </span>
  );
}

export function ProjectTimelineEffectLaneLabelRow({
  compactRows = false,
  icon,
  trailingControls,
  title,
  onSelect,
  isSelected,
}: {
  compactRows?: boolean;
  icon: React.ReactNode;
  trailingControls?: React.ReactNode;
  title: string;
  onSelect?: (() => void) | undefined;
  isSelected?: boolean | undefined;
}) {
  return (
    <ProjectTimelineEffectLaneRow>
      <div
        className={[
          compactRows ? 'flex h-full items-center justify-center' : EFFECT_LANE_LABEL_CLASS_NAME,
          isSelected ? 'bg-[var(--sniptale-color-accent-soft)]' : '',
        ].join(' ')}
      >
        {onSelect ? (
          <button
            type="button"
            data-ui="video-editor.timeline.motion-lane-select"
            aria-pressed={isSelected ?? false}
            aria-label={title}
            onClick={onSelect}
            className={[
              'flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left',
              'focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
            ].join(' ')}
          >
            <LaneIdentity icon={icon} title={title} compactRows={compactRows} />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <LaneIdentity icon={icon} title={title} compactRows={compactRows} />
          </div>
        )}
        {trailingControls && !compactRows ? (
          <div className="ml-auto flex shrink-0 gap-1">{trailingControls}</div>
        ) : null}
      </div>
    </ProjectTimelineEffectLaneRow>
  );
}

function LaneIdentity({
  icon,
  title,
  compactRows,
}: {
  icon: React.ReactNode;
  title: string;
  compactRows: boolean;
}) {
  return (
    <>
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[10px] border
            border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]"
      >
        {icon}
      </span>
      {compactRows ? null : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--sniptale-color-text-primary)]">
            {title}
          </div>
        </div>
      )}
    </>
  );
}
