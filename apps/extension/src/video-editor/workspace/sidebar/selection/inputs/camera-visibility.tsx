import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CompactSelect, NumericRow } from '../../../../../ui/compact-inspector-controls';
import {
  cameraSourceTime,
  type CameraPositionEdit,
} from '../../../../../features/video/project/camera/animation';
import {
  isCameraHiddenAt,
  MAX_CAMERA_HIDDEN_RANGES,
  type CameraHiddenRange,
} from '../../../../../features/video/project/camera/visibility';
import type { VideoProjectVideoClip } from '../../../../../features/video/project/types';
import { formatPreciseTime } from '../../../../../composition/library-preview/time-format';
import { translate } from '../../../../../platform/i18n';
import { InspectorDetails } from '../shared/details';
import { InspectorActionButton } from '../shared/actions';

export function CameraVisibilityControls(props: {
  clip: VideoProjectVideoClip;
  currentTime: number;
  sourceDuration: number;
  disabled: boolean;
  onEdit?: (clipId: string, edit: CameraPositionEdit) => void;
}) {
  const [selectedId, select] = useState<string | null>(null);
  const ranges = props.clip.cameraHiddenRanges ?? [];
  const time = cameraSourceTime(props.clip, props.currentTime);
  const selected =
    ranges.find((range) => range.id === selectedId) ??
    ranges.find((range) => isCameraHiddenAt([range], time)) ??
    ranges.at(-1);
  const duration = Math.max(props.sourceDuration, ranges.at(-1)?.end ?? 0);
  const nextStart = ranges.find((range) => range.start > time)?.start ?? duration;
  const end = Math.min(
    props.clip.sourceStart + props.clip.sourceDuration,
    duration,
    nextStart,
    time + (props.clip.playbackRate ?? 1)
  );
  const disabled = props.disabled || !props.onEdit;
  const canAdd =
    ranges.length < MAX_CAMERA_HIDDEN_RANGES &&
    !isCameraHiddenAt(ranges, time) &&
    end - time >= 0.001;
  const edit = (command: CameraPositionEdit) => props.onEdit?.(props.clip.id, command);
  return (
    <div data-ui="video-editor.camera-visibility">
      <InspectorDetails
        preferenceId="camera:visibility"
        label={translate('videoEditor.sidebar.cameraHiddenRanges')}
      >
        {renderCameraVisibilityActions({
          ranges,
          selected,
          disabled,
          canAdd,
          time,
          end,
          select,
          onEdit: edit,
        })}
        {selected ? (
          <CameraVisibilityBounds
            range={selected}
            ranges={ranges}
            duration={duration}
            disabled={disabled}
            onEdit={edit}
          />
        ) : null}
      </InspectorDetails>
    </div>
  );
}

function renderCameraVisibilityActions({
  ranges,
  selected,
  disabled,
  canAdd,
  time,
  end,
  select,
  onEdit,
}: {
  ranges: readonly CameraHiddenRange[];
  selected: CameraHiddenRange | undefined;
  disabled: boolean;
  canAdd: boolean;
  time: number;
  end: number;
  select: (id: string | null) => void;
  onEdit: (command: CameraPositionEdit) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {selected ? (
        <div className="min-w-0 flex-1">
          <CompactSelect
            appearance="plain"
            aria-label={translate('videoEditor.sidebar.cameraHiddenRange')}
            value={selected.id}
            options={ranges.map((range) => ({
              value: range.id,
              label: `${formatPreciseTime(range.start)}–${formatPreciseTime(range.end)}`,
            }))}
            disabled={disabled}
            onChange={select}
          />
        </div>
      ) : null}
      <InspectorActionButton
        iconOnly={selected !== undefined}
        tone="secondary"
        aria-label={translate('videoEditor.sidebar.cameraHideInterval')}
        title={translate('videoEditor.sidebar.cameraHideInterval')}
        disabled={disabled || !canAdd}
        onClick={() => {
          select(null);
          onEdit({ kind: 'hide', start: time, end: end });
        }}
      >
        <Plus size={14} />
        {selected ? null : translate('videoEditor.sidebar.cameraHideInterval')}
      </InspectorActionButton>
      {selected ? (
        <InspectorActionButton
          iconOnly
          tone="secondary"
          aria-label={translate('videoEditor.sidebar.cameraShowInterval')}
          title={translate('videoEditor.sidebar.cameraShowInterval')}
          disabled={disabled}
          onClick={() => {
            select(null);
            onEdit({ kind: 'show', id: selected.id });
          }}
        >
          <Trash2 size={14} />
        </InspectorActionButton>
      ) : null}
    </div>
  );
}

function CameraVisibilityBounds(props: {
  range: CameraHiddenRange;
  ranges: readonly CameraHiddenRange[];
  duration: number;
  disabled: boolean;
  onEdit: (command: CameraPositionEdit) => void;
}) {
  const index = props.ranges.findIndex((range) => range.id === props.range.id);
  return (
    <>
      {(['start', 'end'] as const).map((edge) => {
        const value = props.range[edge];
        return (
          <NumericRow
            key={`${props.range.id}:${edge}`}
            appearance="plain"
            label={translate(
              edge === 'start'
                ? 'videoEditor.sidebar.cameraHiddenStart'
                : 'videoEditor.sidebar.cameraHiddenEnd'
            )}
            value={value}
            unit="s"
            step={0.01}
            precision={3}
            min={edge === 'start' ? (props.ranges[index - 1]?.end ?? 0) : props.range.start + 0.001}
            max={
              edge === 'end'
                ? (props.ranges[index + 1]?.start ?? props.duration)
                : props.range.end - 0.001
            }
            disabled={props.disabled}
            normalizeValue={(requested) =>
              requested === Number(value.toFixed(3)) ? value : requested
            }
            onPreviewValue={() => undefined}
            onCommitValue={(next) =>
              props.onEdit({
                kind: 'hide',
                id: props.range.id,
                start: props.range.start,
                end: props.range.end,
                [edge]: next,
              })
            }
          />
        );
      })}
    </>
  );
}
