import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CompactSelect, NumericRow } from '../../../../../ui/compact-inspector-controls';
import {
  cameraSourceTime,
  cameraTimelineTime,
  cameraTimingRate,
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
  timelineDuration?: number;
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
  const resultClock = props.clip.cameraTiming?.timeDomain === 'result';
  const clipEnd = resultClock
    ? cameraSourceTime(props.clip, props.clip.startTime + props.clip.duration)
    : props.clip.sourceStart + props.clip.sourceDuration;
  const duration = resultClock
    ? Math.max(
        cameraSourceTime(
          props.clip,
          props.timelineDuration ?? props.clip.startTime + props.clip.duration
        ),
        clipEnd,
        ranges.at(-1)?.end ?? 0
      )
    : Math.max(
        props.sourceDuration + (props.clip.cameraTiming?.offsetSeconds ?? 0),
        clipEnd,
        ranges.at(-1)?.end ?? 0
      );
  const nextStart = ranges.find((range) => range.start > time)?.start ?? duration;
  const end = Math.min(clipEnd, duration, nextStart, time + cameraTimingRate(props.clip));
  const disabled = props.disabled || !props.onEdit;
  const canAdd =
    ranges.length < MAX_CAMERA_HIDDEN_RANGES &&
    !isCameraHiddenAt(ranges, time) &&
    end - time >= 0.001;
  const edit = (command: CameraPositionEdit) => props.onEdit?.(props.clip.id, command);
  const displayRanges = resultClock
    ? ranges.map((range) => ({
        ...range,
        start: cameraTimelineTime(props.clip, range.start),
        end: cameraTimelineTime(props.clip, range.end),
      }))
    : ranges;
  const displaySelected = displayRanges.find((range) => range.id === selected?.id);
  const displayDuration = resultClock
    ? Math.max(
        props.timelineDuration ?? props.clip.startTime + props.clip.duration,
        displayRanges.at(-1)?.end ?? 0
      )
    : duration;
  return (
    <div data-ui="video-editor.camera-visibility">
      <InspectorDetails
        preferenceId="camera:visibility"
        label={translate('videoEditor.sidebar.cameraHiddenRanges')}
      >
        {renderCameraVisibilityActions({
          ranges: displayRanges,
          selected: displaySelected,
          disabled,
          canAdd,
          time,
          end,
          select,
          onEdit: edit,
        })}
        {displaySelected ? (
          <CameraVisibilityBounds
            range={displaySelected}
            ranges={displayRanges}
            duration={displayDuration}
            disabled={disabled}
            onEdit={(command) =>
              edit(
                resultClock && command.kind === 'hide'
                  ? {
                      ...command,
                      start: cameraSourceTime(props.clip, command.start),
                      end: cameraSourceTime(props.clip, command.end),
                    }
                  : command
              )
            }
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
