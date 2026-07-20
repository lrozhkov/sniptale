import { translate } from '../../../../platform/i18n';
import type { VideoProjectUtilityLaneKind } from '../../../../features/video/project/utility-lanes';
import type { VideoProjectUtilityLanes } from '../../../../features/video/project/types';

export function UtilityLaneControlRow(props: {
  label: string;
  rowHeight: number;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b border-[color:var(--sniptale-color-border-subtle)] px-3"
      style={{ height: props.rowHeight }}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{props.label}</span>
      <TextToggleButton
        label={
          props.visible
            ? translate('videoEditor.timeline.hideInCollapsedPanel')
            : translate('videoEditor.timeline.showInCollapsedPanel')
        }
        onClick={() => props.onVisibleChange(!props.visible)}
      />
    </div>
  );
}

export function UtilityProjectLaneControlRow(props: {
  height: number;
  label: string;
  lane: VideoProjectUtilityLaneKind;
  state: VideoProjectUtilityLanes[VideoProjectUtilityLaneKind];
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b border-[color:var(--sniptale-color-border-subtle)] px-3"
      style={{ height: props.height }}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{props.label}</span>
      <TextToggleButton
        disabled={props.state.locked}
        label={translate('videoEditor.timeline.clearLane')}
        onClick={() => props.onClearUtilityLane(props.lane)}
      />
    </div>
  );
}

function TextToggleButton(props: {
  disabled?: boolean | undefined;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'h-7 rounded-md px-2 text-[11px] font-semibold',
        'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
        'disabled:opacity-45',
      ].join(' ')}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}
